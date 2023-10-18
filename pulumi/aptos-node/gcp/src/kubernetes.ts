import * as k8sClientLib from '@kubernetes/client-node';
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as helm from "@pulumi/kubernetes/helm/v3";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import { helmConfig } from './config';

export interface KubernetesConfig {
    aptosNodeHelmChartPath: pulumi.Input<string>
    chainId: pulumi.Input<string>
    chainName: pulumi.Input<string>
    cluster: gcp.container.Cluster;
    enableLogger: pulumi.Input<boolean>
    enableMonitoring: pulumi.Input<boolean>
    enableNodeExporter: pulumi.Input<boolean>
    era: pulumi.Input<Number>
    gkeEnableNodeAutoprovisioning: pulumi.Input<string>
    loggerHelmConfig: helmConfig
    monitoringHelmConfig: helmConfig
    nodeExporterHelmValues: pulumi.Input<any>
    numFullnodeGroups: pulumi.Input<number>
    numValidators: pulumi.Input<number>
    utilityNodePool: gcp.container.NodePool
    validatorHelmConfig: helmConfig
    validatorName: pulumi.Input<string>
    validatorNodePool: gcp.container.NodePool
    workspace: pulumi.Input<string>

}

export class Kubernetes extends pulumi.ComponentResource {
    public readonly ssdStorageClass: k8s.storage.v1.StorageClass;
    public readonly validatorHelmRelease: helm.Release;
    public readonly loggerHelmRelease: helm.Release | undefined;
    public readonly monitoringHelmRelease: helm.Release | undefined;
    public readonly nodeExporterHelmRelease: helm.Release | undefined;
    public readonly provider: k8s.Provider;

    constructor(name: string, config: KubernetesConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:Kubernetes", name, {}, opts);

        pulumi.log.info(`enableAutoProvisioning? ${config.gkeEnableNodeAutoprovisioning}`);

        const helmReleaseName = pulumi.interpolate`${config.validatorHelmConfig.releaseNameOverride === "" ? config.workspace : config.validatorHelmConfig.releaseNameOverride}`;

        // pulumi example for creating a k8s kubeconfig:: https://github.com/pulumi/pulumi-self-hosted-installers/blob/master/gke-hosted/02-kubernetes/cluster.ts
        const kubeconfig = pulumi.all([config.cluster.name, config.cluster.endpoint, config.cluster.masterAuth]).apply(([name, endpoint, masterAuth]) => {
            const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
            const kubeconfigBuilder = new k8sClientLib.KubeConfig();
            kubeconfigBuilder.loadFromOptions({
                clusters: [
                    {
                        name: context,
                        server: `https://${endpoint}`,
                        caData: masterAuth.clusterCaCertificate,
                    },
                ],
                contexts: [
                    {
                        name: context,
                        cluster: context,
                        user: context,
                    },
                ],
                currentContext: context,
                users: [
                    {
                        name: context,
                        authProvider: undefined,
                        exec: {
                            apiVersion: "client.authentication.k8s.io/v1beta1",
                            command: "gke-gcloud-auth-plugin",
                            installHint: "Install gke-gcloud-auth-plugin for use with kubectl by following " +
                                "https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke",
                            provideClusterInfo: true,
                        },
                    },
                ],
            });
            return kubeconfigBuilder;
        });

        this.provider = new k8s.Provider(`k8s`, {
            kubeconfig: kubeconfig.apply(kubeconfig => kubeconfig.exportConfig()),
        }, {
            ignoreChanges: ["kubeconfig"],
            parent: this
        });

        // Create a new SSD storage class
        this.ssdStorageClass = new k8s.storage.v1.StorageClass(`ssd`, {
            metadata: {
                name: "ssd2",
            },
            provisioner: "kubernetes.io/gce-pd",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "pd-ssd",
            },
        }, {
            provider: this.provider,
            parent: this
        });

        let validatorHelmValues: pulumi.Input<{ [key: string]: any }> = {
            "numValidators": config.numValidators,
            "numFullnodeGroups": config.numFullnodeGroups,
            "imageTag": config.validatorHelmConfig.imageTag,
            "manageImages": config.validatorHelmConfig.manageViaPulumi,
            "chain": {
                "name": config.chainName,
                "chain_id": config.chainId,
                "era": config.era,
            },
            "validator": {
                "name": config.validatorName,
                "storage": {
                    "class": this.ssdStorageClass.metadata.name,
                },
                "nodeSelector": config.gkeEnableNodeAutoprovisioning ? {} : {
                    "cloud.google.com/gke-nodepool": config.utilityNodePool.name,
                },
                "tolerations": [{
                    "key": "aptos.org/nodepool",
                    "value": "validators",
                    "effect": "NoExecute",
                }],
            },
            "fullnode": {
                "storage": {
                    "class": this.ssdStorageClass.metadata.name,
                },
                "nodeSelector": config.gkeEnableNodeAutoprovisioning ? {} : {
                    "cloud.google.com/gke-nodepool": config.validatorNodePool.name,
                },
                "tolerations": [{
                    "key": "aptos.org/nodepool",
                    "value": "validators",
                    "effect": "NoExecute",
                }],
            },
            "haproxy": {
                "nodeSelector": config.gkeEnableNodeAutoprovisioning ? {} : {
                    "cloud.google.com/gke-nodepool": config.utilityNodePool.name,
                },
            },
            "service": {
            },
        };

        if (config.validatorHelmConfig.valuesFilePath) {
            const filePath = path.resolve(config.validatorHelmConfig.valuesFilePath.toString());
            if (fs.existsSync(filePath)) {
                const fileContents = fs.readFileSync(filePath, "utf8");
                const fileValues = JSON.parse(fileContents);
                validatorHelmValues = pulumi.output(fileValues).apply(fileValues => {
                    return pulumi.all([validatorHelmValues, fileValues]).apply(([values, fileValues]) => {
                        return Object.assign({}, values, fileValues);
                    });
                });
            }
        }

        this.validatorHelmRelease = new helm.Release(`validator`, {
            name: helmReleaseName,
            chart: pulumi.interpolate`${__dirname}${config.aptosNodeHelmChartPath}`,
            maxHistory: 5,
            version: "1.0.0",
            timeout: 0,
            values: validatorHelmValues,
        }, {
            provider: this.provider,
            parent: this
        });

        if (config.enableLogger) {
            let loggerHelmValues: pulumi.Input<{ [key: string]: any }> = {
                "logger": {
                    "name": "aptos-logger",
                },
                "chain": {
                    "name": config.chainName,
                },
                "serviceAccount": {
                    "create": false,
                    "name": pulumi.interpolate`${helmReleaseName}-aptos-node-validator`,
                },
            }

            if (config.loggerHelmConfig.valuesFilePath) {
                const filePath = path.resolve(__dirname + config.loggerHelmConfig.valuesFilePath.toString());
                if (fs.existsSync(filePath)) {
                    const fileContents = fs.readFileSync(filePath, "utf8");
                    const fileValues = JSON.parse(fileContents);
                    loggerHelmValues = pulumi.output(fileValues).apply(fileValues => {
                        return pulumi.all([loggerHelmValues, fileValues]).apply(([values, fileValues]) => {
                            return Object.assign({}, values, fileValues);
                        });
                    });
                }
            }

            this.loggerHelmRelease = new helm.Release(`logger`, {
                name: pulumi.interpolate`${helmReleaseName}-log`,
                chart: pulumi.interpolate`${__dirname}${config.loggerHelmConfig.chartPath}`,
                maxHistory: 10,
                version: "0.2.0",
                timeout: 0,
                values: loggerHelmValues,
            }, {
                provider: this.provider,
                parent: this
            });
        }

        if (config.enableMonitoring) {
            let monitoringHelmValues: pulumi.Input<{ [key: string]: any }> = {
                "chain": {
                    "name": config.chainName,
                },
                "validator": {
                    "name": config.validatorName,
                },
                "monitoring": {
                    "prometheus": {
                        "storage": {
                            "class": this.ssdStorageClass.metadata.name,
                        },
                    },
                },
            }

            if (config.monitoringHelmConfig.valuesFilePath) {
                const filePath = path.resolve(config.monitoringHelmConfig.valuesFilePath.toString());
                if (fs.existsSync(filePath)) {
                    const fileContents = fs.readFileSync(filePath, "utf8");
                    const fileValues = JSON.parse(fileContents);
                    monitoringHelmValues = pulumi.output(fileValues).apply(fileValues => {
                        return pulumi.all([monitoringHelmValues, fileValues]).apply(([values, fileValues]) => {
                            return Object.assign({}, values, fileValues);
                        });
                    });
                }
            }

            this.monitoringHelmRelease = new helm.Release(`monitoring`, {
                name: pulumi.interpolate`${helmReleaseName}-mon`,
                chart: pulumi.interpolate`${__dirname}${config.monitoringHelmConfig.chartPath}`,
                maxHistory: 10,
                version: "0.2.0",
                timeout: 0,
                values: monitoringHelmValues,
            }, {
                provider: this.provider,
                parent: this
            });
        }

        if (config.enableNodeExporter) {
            this.nodeExporterHelmRelease = new helm.Release(`node-exporter`, {
                name: "prometheus-node-exporter",
                repositoryOpts: {
                    repo: "https://prometheus-community.github.io/helm-charts",
                },
                chart: "prometheus-node-exporter",
                version: "4.0.0",
                timeout: 0,
                namespace: "kube-system",
                maxHistory: 5,
                waitForJobs: false,

                values: config.nodeExporterHelmValues,
            }, {
                provider: this.provider,
                parent: this
            });
        }
    }
}

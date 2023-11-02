import * as k8sClientLib from '@kubernetes/client-node';
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as helm from "@pulumi/kubernetes/helm/v3";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import { helmConfig } from './config';
import { getK8sProviderFromGkeCluster } from "../../../lib/gcpGkeKubeConfig";

export interface KubernetesConfig {
    aptosNodeHelmChartPath: pulumi.Input<string>
    chainId: pulumi.Input<string>
    chainName: string
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
    manageViaPulumi: pulumi.Input<boolean>
}

export class Kubernetes extends pulumi.ComponentResource {
    public readonly ssdStorageClass: k8s.storage.v1.StorageClass;
    public readonly validatorHelmRelease: helm.Release;
    public readonly loggerHelmRelease: helm.Release | undefined;
    public readonly monitoringHelmRelease: helm.Release | undefined;
    public readonly nodeExporterHelmRelease: helm.Release | undefined;
    public readonly provider: k8s.Provider;

    constructor(name: string, args: KubernetesConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:Kubernetes", name, {}, opts);

        pulumi.log.info(`enableAutoProvisioning? ${args.gkeEnableNodeAutoprovisioning}`);

        const helmReleaseName = pulumi.interpolate`${args.validatorHelmConfig.releaseNameOverride === "" ? args.workspace : args.validatorHelmConfig.releaseNameOverride}`;

        // pulumi example for creating a k8s kubeconfig:: https://github.com/pulumi/pulumi-self-hosted-installers/blob/master/gke-hosted/02-kubernetes/cluster.ts
        const kubeconfig = pulumi.all([args.cluster.name, args.cluster.endpoint, args.cluster.masterAuth]).apply(([name, endpoint, masterAuth]) => {
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

        this.provider = getK8sProviderFromGkeCluster({
            GkeCluster: args.cluster,
        }, { parent: this });

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
            "numValidators": args.numValidators,
            "numFullnodeGroups": args.numFullnodeGroups,
            "imageTag": args.validatorHelmConfig.imageTag,
            "manageImages": args.manageViaPulumi,
            "chain": {
                "name": args.chainName,
                "chain_id": args.chainId,
                "era": args.era,
            },
            "validator": {
                "name": args.validatorName,
                "storage": {
                    "class": this.ssdStorageClass.metadata.name,
                },
                "nodeSelector": args.gkeEnableNodeAutoprovisioning ? {} : {
                    "cloud.google.com/gke-nodepool": args.utilityNodePool.name,
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
                "nodeSelector": args.gkeEnableNodeAutoprovisioning ? {} : {
                    "cloud.google.com/gke-nodepool": args.validatorNodePool.name,
                },
                "tolerations": [{
                    "key": "aptos.org/nodepool",
                    "value": "validators",
                    "effect": "NoExecute",
                }],
            },
            "haproxy": {
                "nodeSelector": args.gkeEnableNodeAutoprovisioning ? {} : {
                    "cloud.google.com/gke-nodepool": args.utilityNodePool.name,
                },
            },
            "service": {
            },
        };

        if (args.validatorHelmConfig.valuesFilePath) {
            const filePath = path.resolve(args.validatorHelmConfig.valuesFilePath.toString());
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
            chart: pulumi.interpolate`${__dirname}${args.aptosNodeHelmChartPath}`,
            maxHistory: 5,
            version: "1.0.0",
            timeout: 0,
            values: validatorHelmValues,
        }, {
            provider: this.provider,
            parent: this
        });

        if (args.enableLogger) {
            let loggerHelmValues: pulumi.Input<{ [key: string]: any }> = {
                "logger": {
                    "name": "aptos-logger",
                },
                "chain": {
                    "name": args.chainName,
                },
                "serviceAccount": {
                    "create": false,
                    "name": pulumi.interpolate`${helmReleaseName}-aptos-node-validator`,
                },
            }

            if (args.loggerHelmConfig.valuesFilePath) {
                const filePath = path.resolve(__dirname + args.loggerHelmConfig.valuesFilePath.toString());
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
                chart: pulumi.interpolate`${__dirname}${args.loggerHelmConfig.chartPath}`,
                maxHistory: 10,
                version: "0.2.0",
                timeout: 0,
                values: loggerHelmValues,
            }, {
                provider: this.provider,
                parent: this
            });
        }

        if (args.enableMonitoring) {
            let monitoringHelmValues: pulumi.Input<{ [key: string]: any }> = {
                "chain": {
                    "name": args.chainName,
                },
                "validator": {
                    "name": args.validatorName,
                },
                "monitoring": {
                    "prometheus": {
                        "storage": {
                            "class": this.ssdStorageClass.metadata.name,
                        },
                    },
                },
            }

            if (args.monitoringHelmConfig.valuesFilePath) {
                const filePath = path.resolve(args.monitoringHelmConfig.valuesFilePath.toString());
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
                chart: pulumi.interpolate`${__dirname}${args.monitoringHelmConfig.chartPath}`,
                maxHistory: 10,
                version: "0.2.0",
                timeout: 0,
                values: monitoringHelmValues,
            }, {
                provider: this.provider,
                parent: this
            });
        }

        if (args.enableNodeExporter) {
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

                values: args.nodeExporterHelmValues,
            }, {
                provider: this.provider,
                parent: this
            });
        }
    }
}

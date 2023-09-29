import * as k8sClientLib from '@kubernetes/client-node';
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as helm from "@pulumi/kubernetes/helm/v3";
import * as pulumi from "@pulumi/pulumi";
import { base64decode } from '@pulumi/std';
import * as fs from "fs";
import * as path from "path";

export interface KubernetesConfig {
    aptosNodeHelmChartPath: pulumi.Input<string>
    chainId: pulumi.Input<string>
    chainName: pulumi.Input<string>
    cluster: gcp.container.Cluster;
    enableLogger: pulumi.Input<string>
    enableMonitoring: pulumi.Input<string>
    enableNodeExporter: pulumi.Input<boolean>
    era: pulumi.Input<string>
    gkeEnableNodeAutoprovisioning: pulumi.Input<string>
    helmReleaseName: pulumi.Input<string>;
    helmValues: pulumi.Input<any>
    helmValuesFilePathForValidators: string
    helmValuesFilePathForUtilities: string
    helmValuesFilePathForMonitoring: string
    helmValuesFilePathForLogger: string
    imageTag: pulumi.Input<string>
    loggerHelmChartPath: pulumi.Input<string>
    loggerHelmValues: pulumi.Input<any>
    manageViaTf: pulumi.Input<string>
    monitoringHelmChartPath: pulumi.Input<string>
    monitoringHelmValues: pulumi.Input<any>
    namespace: pulumi.Input<string>;
    nodeExporterHelmValues: pulumi.Input<any>
    numFullnodeGroups: pulumi.Input<string>
    numValidators: pulumi.Input<string>
    validatorName: pulumi.Input<string>
    utilityNodePool: gcp.container.NodePool
    validatorNodePool: gcp.container.NodePool
}

export class Kubernetes extends pulumi.ComponentResource {
    public readonly ssdStorageClass: k8s.storage.v1.StorageClass;
    public readonly validatorHelmRelease: helm.Release;
    public readonly loggerHelmRelease: helm.Release;
    public readonly monitoringHelmRelease: helm.Release;
    public readonly nodeExporterHelmRelease: helm.Release;

    constructor(name: string, config: KubernetesConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:kubernetes:Kubernetes", name, {}, opts);

        // pulumi example for creating a k8s kubeconfig:: https://github.com/pulumi/pulumi-self-hosted-installers/blob/master/gke-hosted/02-kubernetes/cluster.ts
        // TODO: move kubeconfig generation to cluster component and output a Output<string> on the cluster as a property
        const kubeconfig = pulumi.all([config.cluster.name, config.cluster.endpoint, config.cluster.masterAuth[0].clusterCaCertificate]).apply(([name, endpoint, clusterCert]) => {
            const kubeconfigBuilder = new k8sClientLib.KubeConfig();
            kubeconfigBuilder.loadFromOptions({
                clusters: [
                    {
                        name: name,
                        server: endpoint,
                        caData: clusterCert,
                    },
                ],
                contexts: [
                    {
                        name: name,
                        cluster: name,
                        user: name,
                    },
                ],
                currentContext: name,
                users: [
                    {
                        name: name,
                        // token: String(config.cluster.identities.apply(identities => identities[0].oidcs?.[0]?.issuer)).split("id/")[1],
                        authProvider: undefined,
                        exec: undefined,
                    },
                ],
            })
        });

        // const kubeconfig = new k8sClientLib.KubeConfig();
        // kubeconfig.loadFromOptions({
        //     clusters: [
        //         {
        //             name: String(config.cluster.name),
        //             server: String(config.cluster.endpoint),
        //             caData: config.cluster.masterAuth[0].clusterCaCertificate,
        //         },
        //     ],
        //     contexts: [
        //         {
        //             name: String(config.cluster.name),
        //             cluster: String(config.cluster.name),
        //             user: String(config.cluster.name),
        //         },
        //     ],
        //     currentContext: String(config.cluster.name),
        //     users: [
        //         {
        //             name: String(config.cluster.name),
        //             // token: String(config.cluster.identities.apply(identities => identities[0].oidcs?.[0]?.issuer)).split("id/")[1],
        //             authProvider: undefined,
        //             exec: undefined,
        //         },
        //     ],
        // })

        const provider = new k8s.Provider(`k8s`, {
            kubeconfig: kubeconfig.exportConfig(),
        }, { parent: this });


        // Create a new SSD storage class
        this.ssdStorageClass = new k8s.storage.v1.StorageClass(`ssd`, {
            metadata: {
                name: "ssd",
            },
            provisioner: "kubernetes.io/gce-pd",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "pd-ssd",
            },
        }, { parent: this });

        let validatorHelmValues: pulumi.Input<{ [key: string]: any }> = {
            "numValidators": config.numValidators,
            "numFullnodeGroups": config.numFullnodeGroups,
            "imageTag": config.imageTag,
            "manageImages": config.manageViaTf,
            "chain": {
                "name": config.chainName,
                "id": config.chainId,
                "era": config.era,
            },
            "validator": {
                "name": config.validatorName,
                "storage": {
                    "class": this.ssdStorageClass.metadata[0].name,
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
                    "class": this.ssdStorageClass.metadata[0].name,
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
                // "domain": ,
            },
        };

        if (config.helmValuesFilePathForValidators) {
            const filePath = path.resolve(config.helmValuesFilePathForValidators);
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
            name: config.helmReleaseName,
            chart: config.aptosNodeHelmChartPath,
            maxHistory: 5,
            values: validatorHelmValues,
        }, { parent: this });

        let loggerHelmValues: pulumi.Input<{ [key: string]: any }> = {
            "logger": {
                "name": "aptos-logger",
            },
            "chain": {
                "name": config.chainName,
            },
            "serviceAccount": {
                "create": false,
                "name": config.helmReleaseName === "aptos-node" ? "aptos-node-validator" : `${config.helmReleaseName}-aptos-node-validator`,
            },
        }

        if (config.helmValuesFilePathForLogger) {
            const filePath = path.resolve(config.helmValuesFilePathForLogger);
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
            name: `${config.helmReleaseName}-log`,
            chart: config.loggerHelmChartPath,
            maxHistory: 10,
            values: loggerHelmValues,
        }, { parent: this });

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
                        "class": this.ssdStorageClass.metadata[0].name,
                    },
                },
            },
        }

        if (config.helmValuesFilePathForMonitoring) {
            const filePath = path.resolve(config.helmValuesFilePathForMonitoring);
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
            name: `${config.helmReleaseName}-mon`,
            chart: config.monitoringHelmChartPath,
            maxHistory: 10,
            values: monitoringHelmValues,
        }, { parent: this });

        this.nodeExporterHelmRelease = new helm.Release(`node-exporter`, {
            name: "prometheus-node-exporter",
            repositoryOpts: {
                repo: "https://prometheus-community.github.io/helm-charts",
            },
            chart: "prometheus-node-exporter",
            version: "4.0.0",
            namespace: "kube-system",
            maxHistory: 5,
            waitForJobs: config.enableNodeExporter,

            values: config.nodeExporterHelmValues,
        }, { parent: this });
    }
}

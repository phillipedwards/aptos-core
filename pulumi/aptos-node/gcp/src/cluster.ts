import * as k8sClientLib from '@kubernetes/client-node';
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

export interface ClusterConfig {
    clusterIpv4CidrBlock: pulumi.Input<string>;
    gkeMaintenancePolicy: any;
    googleServiceAccountEmail: pulumi.Input<string>;
    k8sApiSources: pulumi.Input<string>[];
    location: pulumi.Input<string>;
    name: pulumi.Input<string>;
    nodePoolConfigsForUtilities: NodePoolConfig;
    nodePoolConfigsForValidators: NodePoolConfig;
    projectId: string;
    autoscalingConfig: autoscalingConfig;
    network: gcp.compute.Network;
}

export interface autoscalingConfig {
    gkeEnableNodeAutoprovisioning: pulumi.Input<boolean>;
    gkeEnableAutoscaling: pulumi.Input<boolean>;
    gkeNodeAutoprovisioningMaxCpu: pulumi.Input<number>;
    gkeNodeAutoprovisioningMaxMemory: pulumi.Input<number>;
    gkeAutoscalingMaxNodeCount: pulumi.Input<number>;
    gkeAutoscalingMinNodeCount: pulumi.Input<number>;
    gkeAutoscalingDesiredNodeCount: pulumi.Input<number>;
}

export interface NodePoolConfig {
    diskSizeGb: pulumi.Input<number>;
    enableTaints: pulumi.Input<boolean>;
    machineType: pulumi.Input<string>;
    maxNodeCount: pulumi.Input<number>;
    minNodeCount: pulumi.Input<number>;
    name: pulumi.Input<string>;
}

export class Cluster extends pulumi.ComponentResource {
    public readonly cluster: gcp.container.Cluster;
    public readonly utilitiesNodePool: gcp.container.NodePool;
    public readonly validatorsNodePool: gcp.container.NodePool;
    public readonly kubeconfig: pulumi.Output<k8sClientLib.KubeConfig>;

    constructor(name: string, config: ClusterConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:Cluster", name, {}, opts);

        // Create a new GKE cluster
        this.cluster = new gcp.container.Cluster(`aptos_1`, {
            name: config.name,
            location: config.location,
            network: config.network.id,
            removeDefaultNodePool: true,
            initialNodeCount: 1,
            loggingService: "logging.googleapis.com/kubernetes",
            monitoringService: "monitoring.googleapis.com/kubernetes",

            releaseChannel: {
                channel: "REGULAR",
            },

            podSecurityPolicyConfig: {
                enabled: false,
            },

            masterAuth: {
                clientCertificateConfig: {
                    issueClientCertificate: false,
                },
            },

            masterAuthorizedNetworksConfig: {
                cidrBlocks: config.k8sApiSources.map(eachCidrBlock => ({
                    cidrBlock: eachCidrBlock,
                })),
            },

            privateClusterConfig: {
                enablePrivateEndpoint: false,
                enablePrivateNodes: true,
                masterIpv4CidrBlock: "172.16.0.0/28"
            },

            ipAllocationPolicy: {
                clusterIpv4CidrBlock: config.clusterIpv4CidrBlock,
            },

            workloadIdentityConfig: {
                workloadPool: pulumi.interpolate`${config.projectId}.svc.id.goog`,
            },

            addonsConfig: {
                networkPolicyConfig: {
                    disabled: true,
                },
            },

            networkPolicy: {
                enabled: false,
            },

            clusterAutoscaling: {
                enabled: config.autoscalingConfig.gkeEnableAutoscaling,
                resourceLimits: [
                    {
                        resourceType: "cpu",
                        minimum: 1,
                        maximum: config.autoscalingConfig.gkeNodeAutoprovisioningMaxCpu,
                    },
                    {
                        resourceType: "memory",
                        minimum: 1,
                        maximum: config.autoscalingConfig.gkeNodeAutoprovisioningMaxMemory,
                    },
                ],
            },

            maintenancePolicy: config.gkeMaintenancePolicy || undefined,
        }, { parent: this });

        // Create new node pools for utilities and validators
        this.utilitiesNodePool = new gcp.container.NodePool(`utilities`, {
            name: config.nodePoolConfigsForUtilities.name,
            location: config.location,
            cluster: this.cluster.name,
            nodeCount: config.nodePoolConfigsForUtilities.minNodeCount,
            autoscaling: config.autoscalingConfig.gkeEnableAutoscaling ? {
                minNodeCount: config.nodePoolConfigsForUtilities.minNodeCount,
                maxNodeCount: config.nodePoolConfigsForUtilities.maxNodeCount,
            } : {},
        }, { parent: this });

        this.validatorsNodePool = new gcp.container.NodePool(`validators`, {
            name: config.nodePoolConfigsForValidators.name,
            location: config.location,
            cluster: this.cluster.name,
            nodeCount: config.nodePoolConfigsForValidators.minNodeCount,
            nodeConfig: {
                machineType: config.nodePoolConfigsForValidators.machineType,
                imageType: "COS_CONTAINERD",
                diskSizeGb: config.nodePoolConfigsForValidators.diskSizeGb,
                serviceAccount: config.googleServiceAccountEmail,
                tags: ["validators"],
                oauthScopes: [
                    "https://www.googleapis.com/auth/cloud-platform",
                ],

                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                },

                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },

                taints: config.nodePoolConfigsForValidators.enableTaints ? [{
                    key: "aptos.org/nodepool",
                    value: "validators",
                    effect: "NO_EXECUTE",
                }] : [],
            },
            autoscaling: config.autoscalingConfig.gkeEnableAutoscaling ? {
                minNodeCount: config.nodePoolConfigsForUtilities.minNodeCount,
                maxNodeCount: config.nodePoolConfigsForUtilities.maxNodeCount,
            } : {},
        }, { parent: this });

        // pulumi example for creating a k8s kubeconfig:: https://github.com/pulumi/pulumi-self-hosted-installers/blob/master/gke-hosted/02-kubernetes/cluster.ts
        // TODO: move kubeconfig generation to cluster component and output a Output<string> on the cluster as a property
        this.kubeconfig = pulumi.all([this.cluster.name, this.cluster.endpoint, this.cluster.masterAuth.clusterCaCertificate]).apply(([name, endpoint, clusterCert]) => {
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
                        authProvider: undefined,
                        exec: undefined,
                    },
                ],
            });
            return kubeconfigBuilder;
        });
    }
}

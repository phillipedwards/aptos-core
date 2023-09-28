import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface ClusterConfig {
    clusterIpv4CidrBlock: pulumi.Input<string>;
    gkeEnableAutoscaling: any;
    gkeEnableNodeAutoprovisioning: pulumi.Input<boolean>;
    gkeMaintenancePolicy: any;
    googleServiceAccountEmail: pulumi.Input<string>;
    k8sApiSources: pulumi.Input<string>[];
    location: pulumi.Input<string>;
    name: pulumi.Input<string>;
    nodePoolConfigsForUtilities: NodePoolConfig;
    nodePoolConfigsForValidators: NodePoolConfig;
    projectId: string;
}

export interface NodePoolConfig {
    diskSizeGb: pulumi.Input<number>;
    diskType: pulumi.Input<string>;
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

    constructor(name: string, config: ClusterConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:cluster:Cluster", name, {}, opts);

        // Create a new GKE cluster
        this.cluster = new gcp.container.Cluster(`cluster`, {
            name: config.name,
            location: config.location,
            initialNodeCount: 1,
            removeDefaultNodePool: true,
            nodeConfig: {
                machineType: "n1-standard-2",
                diskSizeGb: 100,
                diskType: "pd-standard",
                oauthScopes: [
                    "https://www.googleapis.com/auth/compute",
                    "https://www.googleapis.com/auth/devstorage.read_only",
                    "https://www.googleapis.com/auth/logging.write",
                    "https://www.googleapis.com/auth/monitoring",
                ],
            },
            loggingService: "logging.googleapis.com/kubernetes",
            monitoringService: "monitoring.googleapis.com/kubernetes",

            releaseChannel: {
                channel: "REGULAR",
            },

            podSecurityPolicyConfig: {
                enabled: true,
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
                workloadPool: `${config.projectId}.svc.id.goog`,
            },

            addonsConfig: {
                networkPolicyConfig: {
                    disabled: false,
                },
            },

            networkPolicy: {
                enabled: false,
            },

            clusterAutoscaling: {
                enabled: config.gkeEnableNodeAutoprovisioning,
            },

            maintenancePolicy: {
                recurringWindow: config.gkeMaintenancePolicy.recurringWindow.map(eachRecurringWindow => ({
                    startTime: eachRecurringWindow.startTime,
                    endTime: eachRecurringWindow.endTime,
                    recurrence: eachRecurringWindow.recurrence,
                })),
            },
        }, { parent: this });

        // Create new node pools for utilities and validators
        this.utilitiesNodePool = new gcp.container.NodePool(`utilities`, {
            name: config.nodePoolConfigsForUtilities.name,
            location: config.location,
            cluster: this.cluster.name,
            nodeCount: config.nodePoolConfigsForUtilities.minNodeCount,
            nodeConfig: {
                machineType: config.nodePoolConfigsForUtilities.machineType,
                imageType: "COS_CONTAINERD",
                diskSizeGb: config.nodePoolConfigsForUtilities.diskSizeGb,
                serviceAccount: config.googleServiceAccountEmail,
                tags: ["utilities"],
                oauthScopes: [
                    "https://www.googleapis.com/auth/cloud-platform",
                ],

                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                },

                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },

                taints: config.nodePoolConfigsForUtilities.enableTaints ? [{
                    key: "aptos-node/utility",
                    value: "true",
                    effect: "NoExecute",
                }] : [],
            },
            autoscaling: config.gkeEnableAutoscaling ? {
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
                    value: "true",
                    effect: "NoExecute",
                }] : [],
            },
            autoscaling: config.gkeEnableAutoscaling ? {
                minNodeCount: config.nodePoolConfigsForValidators.minNodeCount,
                maxNodeCount: config.nodePoolConfigsForValidators.maxNodeCount,
            } : {},
        }, { parent: this });
    }
}

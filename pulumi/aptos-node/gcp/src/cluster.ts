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
    nodePoolConfigsForCore: NodePoolConfig;
    projectId: string;
    autoscalingConfig: autoscalingConfig;
    network: gcp.compute.Network;
    enableDns: pulumi.Input<boolean>;
    enableImageStreaming: pulumi.Input<boolean>;
}

export interface autoscalingConfig {
    profile: pulumi.Input<string>;
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
    sysctls: pulumi.Input<Record<string, string>>;
}

export class Cluster extends pulumi.ComponentResource {
    public readonly cluster: gcp.container.Cluster;
    public readonly utilitiesNodePool: gcp.container.NodePool;
    public readonly validatorsNodePool: gcp.container.NodePool;
    public readonly coreNodePool: gcp.container.NodePool;
    public readonly kubeconfig: pulumi.Output<k8sClientLib.KubeConfig>;

    constructor(name: string, config: ClusterConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:Cluster", name, {}, opts);

        // Create a new GKE cluster
        this.cluster = new gcp.container.Cluster(`aptos_1`, {
            name: config.name,
            location: config.location,
            nodeLocations: [config.location],
            network: config.network.id,
            removeDefaultNodePool: true,
            initialNodeCount: 1,
            loggingService: "logging.googleapis.com/kubernetes",
            monitoringService: "monitoring.googleapis.com/kubernetes",

            costManagementConfig: {
                enabled: true,
            },

            releaseChannel: {
                channel: "STABLE",
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
                autoscalingProfile: config.autoscalingConfig.profile,
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
            dnsConfig: config.enableDns ? {
                clusterDns: "CLOUD_DNS",
                clusterDnsScope: "CLUSTER_SCOPE",
            } : {},
            monitoringConfig: {
                managedPrometheus: {
                    enabled: true,
                },
                enableComponents: [
                    "APISERVER",
                    "CONTROLLER_MANAGER",
                    "DAEMONSET",
                    "DEPLOYMENT",
                    "HPA",
                    "POD",
                    "SCHEDULER",
                    "STATEFULSET",
                    "STORAGE",
                    "SYSTEM_COMPONENTS",
                ],
            },
            nodePoolDefaults: {
                nodeConfigDefaults: {
                    gcfsConfig: {
                        enabled: config.enableImageStreaming,
                    },
                },
            },
        }, {
            parent: this,
            ignoreChanges: ["privateClusterConfig"],
            protect: false,
        });

        // Create new node pools for utilities and validators and core
        this.coreNodePool = new gcp.container.NodePool(`core`, {
            name: config.nodePoolConfigsForCore.name,
            location: config.location,
            cluster: this.cluster.name,
            nodeCount: config.nodePoolConfigsForCore.minNodeCount,
            autoscaling: config.autoscalingConfig.gkeEnableAutoscaling ? {
                minNodeCount: config.nodePoolConfigsForCore.minNodeCount,
                maxNodeCount: config.nodePoolConfigsForCore.maxNodeCount,
            } : {},
            nodeConfig: {
                machineType: config.nodePoolConfigsForCore.machineType,
                imageType: "COS_CONTAINERD",
                diskSizeGb: config.nodePoolConfigsForCore.diskSizeGb,
                serviceAccount: config.googleServiceAccountEmail,
                tags: ["core"],
                oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },
                shieldedInstanceConfig: {
                    enableIntegrityMonitoring: true,
                    enableSecureBoot: true,
                },
                gcfsConfig: {
                    enabled: false,
                },
                gvnic: {
                    enabled: true,
                },
                kubeletConfig: {
                    cpuManagerPolicy: "none",
                },
            },
        }, { parent: this });

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
                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },
                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                    enableIntegrityMonitoring: true,
                },
                gvnic: {
                    enabled: true,
                },
                kubeletConfig: {
                    cpuManagerPolicy: "none",
                },
                linuxNodeConfig: {
                    sysctls: config.nodePoolConfigsForUtilities.sysctls,
                },
                taints: config.nodePoolConfigsForUtilities.enableTaints ? [{
                    key: "aptos.org/nodepool",
                    value: "utilities",
                    effect: "NO_EXECUTE",
                }] : [],
            },
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
                    enableIntegrityMonitoring: true,
                },
                gvnic: {
                    enabled: true,
                },
                kubeletConfig: {
                    cpuManagerPolicy: "none",
                },
                linuxNodeConfig: {
                    sysctls: config.nodePoolConfigsForUtilities.sysctls,
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

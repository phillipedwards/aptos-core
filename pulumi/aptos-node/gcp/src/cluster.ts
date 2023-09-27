import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface ClusterConfig {
    name: pulumi.Input<string>;
    location: pulumi.Input<string>;
    nodePoolConfigs: NodePoolConfig[];
}

export interface NodePoolConfig {
    name: pulumi.Input<string>;
    machineType: pulumi.Input<string>;
    diskSizeGb: pulumi.Input<number>;
    diskType: pulumi.Input<string>;
    minNodeCount: pulumi.Input<number>;
    maxNodeCount: pulumi.Input<number>;
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
        }, { parent: this });

        // Create new node pools for utilities and validators
        this.utilitiesNodePool = new gcp.container.NodePool(`utilities`, {
            name: config.nodePoolConfigs[0].name,
            location: config.location,
            cluster: this.cluster.name,
            nodeCount: config.nodePoolConfigs[0].minNodeCount,
            autoscaling: {
                minNodeCount: config.nodePoolConfigs[0].minNodeCount,
                maxNodeCount: config.nodePoolConfigs[0].maxNodeCount,
            },
            nodeConfig: {
                machineType: config.nodePoolConfigs[0].machineType,
                diskSizeGb: config.nodePoolConfigs[0].diskSizeGb,
                diskType: config.nodePoolConfigs[0].diskType,
            },
        }, { parent: this });

        this.validatorsNodePool = new gcp.container.NodePool(`validators`, {
            name: config.nodePoolConfigs[1].name,
            location: config.location,
            cluster: this.cluster.name,
            nodeCount: config.nodePoolConfigs[1].minNodeCount,
            autoscaling: {
                minNodeCount: config.nodePoolConfigs[1].minNodeCount,
                maxNodeCount: config.nodePoolConfigs[1].maxNodeCount,
            },
            nodeConfig: {
                machineType: config.nodePoolConfigs[1].machineType,
                diskSizeGb: config.nodePoolConfigs[1].diskSizeGb,
                diskType: config.nodePoolConfigs[1].diskType,
            },
        }, { parent: this });

        // Export the cluster and node pool information
        this.registerOutputs({
            clusterName: this.cluster.name,
            utilitiesNodePoolName: this.utilitiesNodePool.name,
            validatorsNodePoolName: this.validatorsNodePool.name,
        });
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface ClusterConfig {
    clusterName: pulumi.Input<string>;
    instanceType: pulumi.Input<string>;
    instanceAmi: pulumi.Input<string>;
    instanceKeyPair: pulumi.Input<string>;
}

export class Cluster extends pulumi.ComponentResource {
    public readonly eksCluster: aws.eks.Cluster;
    public readonly eksNodeGroup: aws.eks.NodeGroup;

    constructor(name: string, config: ClusterConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:cluster:Cluster", name, {}, opts);

        // Create a new CloudWatch log group
        const logGroup = new aws.cloudwatch.LogGroup(`log-group`, {
            name: `${config.clusterName}-eks`,
            retentionInDays: 7,
        }, { parent: this });

        // Create a new EKS cluster
        this.eksCluster = new aws.eks.Cluster(`cluster`, {
            name: config.clusterName,
            roleArn: aws.iam.Role.get("eks_cluster", "arn").arn,
            vpcConfig: {
                subnetIds: aws.ec2.getSubnetIds().ids,
            },
            dependsOn: [logGroup],
        }, { parent: this });

        // Create a new launch template for the nodes
        const launchTemplate = new aws.ec2.LaunchTemplate(`launch-template`, {
            imageId: config.instanceAmi,
            instanceType: config.instanceType,
            keyName: config.instanceKeyPair,
            blockDeviceMappings: [{
                deviceName: "/dev/xvda",
                ebs: {
                    volumeSize: 20,
                    volumeType: "gp2",
                },
            }],
        }, { parent: this });

        // Create a new EKS node group
        this.eksNodeGroup = new aws.eks.NodeGroup(`node-group`, {
            clusterName: this.eksCluster.name,
            nodeGroupName: `nodes`,
            nodeRoleArn: aws.iam.Role.get("eks_node_group", "arn").arn,
            scalingConfig: {
                desiredSize: 2,
                maxSize: 2,
                minSize: 2,
            },
            launchTemplate: {
                id: launchTemplate.id,
                version: launchTemplate.latestVersion,
            },
            dependsOn: [this.eksCluster],
        }, { parent: this });

        // Export the cluster information
        this.registerOutputs({
            clusterName: this.eksCluster.name,
            clusterEndpoint: this.eksCluster.endpoint,
            clusterArn: this.eksCluster.arn,
            nodeGroupName: this.eksNodeGroup.nodeGroupName,
            nodeGroupArn: this.eksNodeGroup.arn,
        });
    }
}

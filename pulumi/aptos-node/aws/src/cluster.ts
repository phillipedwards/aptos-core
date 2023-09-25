import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsNative from '@pulumi/aws-native';

export interface NodePoolConfig {
    instance_type: string;
    instance_min_num?: string;
    instance_num?: string;
    instance_max_num?: string;
    instance_enable_taint?: string;
}

interface NodeGroupConfig {
    name: string;
    subnetIds: pulumi.Input<string>[];
    securityGroupIds: pulumi.Input<string>[];
    clusterName: string;
    nodeRoleArn: pulumi.Input<string>;
    tags?: pulumi.Input<aws.ec2.Tag[]>;
    nodePoolConfig: NodePoolConfig;
    kubernetesVersion: pulumi.Input<string>;
    workspaceName: string;
}

class NodeGroup extends pulumi.ComponentResource {
    public readonly launchTemplate: awsNative.ec2.LaunchTemplate;
    public readonly nodeGroup: aws.eks.NodeGroup;

    constructor(name: string, args: NodeGroupConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:NodeGroup", name, {}, opts);

        this.launchTemplate = new awsNative.ec2.LaunchTemplate(`launch-template`, {
            launchTemplateName: `aptos-${args.workspaceName}-${args.name}`,
            // imageId: args.amiId,
            launchTemplateData: {
                instanceType: args.nodePoolConfig.instance_type,
                blockDeviceMappings: [
                    {
                        deviceName: "/dev/xvda",
                        ebs: {
                            volumeSize: 100,
                            volumeType: "gp3",
                            deleteOnTermination: true,
                        },
                    },
                ],
                // TODO tags for resources created by launch template
            },
            // TODO tags for the launch template itself
            tagSpecifications: [
                {
                    // resourceType: "instance",
                    // tags: pulumi.all([
                    //     args.tags,
                    //     { "Name": `${args.name}-instance` },
                    // ]).apply(([tags, nameTag]) => ({ ...tags, ...nameTag })),
                },
            ],
        }, { parent: this });

        this.nodeGroup = new aws.eks.NodeGroup(args.name, {
            clusterName: args.clusterName,
            nodeGroupName: args.name,
            version: args.kubernetesVersion,
            nodeRoleArn: args.nodeRoleArn,
            subnetIds: args.subnetIds,
            scalingConfig: {
                desiredSize: Number(args.nodePoolConfig.instance_num),
                maxSize: Number(args.nodePoolConfig.instance_max_num),
                minSize: Number(args.nodePoolConfig.instance_min_num),
            },
            instanceTypes: [args.nodePoolConfig.instance_type],
            launchTemplate: {
                id: this.launchTemplate.id,
                version: this.launchTemplate.latestVersionNumber,
            },
            taints: args.nodePoolConfig.instance_enable_taint ? [
                {
                    key: "aptos.org/nodepool",
                    value: args.name,
                    effect: "NO_EXECUTE",
                },
            ] : undefined,
            updateConfig: {
                maxUnavailablePercentage: 50,
            },
            // TODO tagging
            // tags: pulumi.all([
            //     args.tags,
            //     { "Name": `${args.name}-node-group` },
            // ]).apply(([tags, nameTag]) => ({ ...tags, ...nameTag })),
        }, {
            ignoreChanges: [
                // ignore autoupgrade version
                'version',
                // ignore changes to the desired size that may occur due to cluster autoscaler
                'scalingConfig.desiredSize',
                // ignore changes to max size, especially when it decreases to < desired_size, which fails
                'scalingConfig.maxSize',
            ],
            parent: this
        });
    }
}

export interface ClusterConfig {
    clusterName: string;
    clusterRoleArn: pulumi.Input<string>;
    nodeRoleArn: pulumi.Input<string>;
    instanceType: pulumi.Input<string>;
    desiredCapacity: pulumi.Input<number>;
    kubernetesVersion: pulumi.Input<string>;
    minSize: pulumi.Input<number>;
    maxSize: pulumi.Input<number>;
    privateSubnetIds: pulumi.Input<string>[];
    publicSubnetIds: pulumi.Input<string>[];
    securityGroupIdNodes: pulumi.Input<string>;
    securityGroupIdCluster: pulumi.Input<string>;
    k8sApiSources: pulumi.Input<string>[];
    utilitiesNodePool?: NodePoolConfig;
    validatorsNodePool?: NodePoolConfig;
    tags?: pulumi.Input<aws.ec2.Tag[]>;
}

export class Cluster extends pulumi.ComponentResource {
    public readonly eksCluster: awsNative.eks.Cluster;
    public readonly utilitiesNodeGroup: NodeGroup;
    public readonly validatorsNodeGroup: NodeGroup;
    public readonly eksNodeGroupRole: awsNative.iam.Role;
    public readonly eksNodeGroupRolePolicyAttachment: aws.iam.RolePolicyAttachment;
    public readonly eksAddon: awsNative.eks.Addon;
    public readonly cloudwatchLogGroup: aws.cloudwatch.LogGroup;
    public readonly launchTemplate: awsNative.ec2.LaunchTemplate;
    public readonly openidConnectProvider: aws.iam.OpenIdConnectProvider;

    constructor(name: string, args: ClusterConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Cluster", name, {}, opts);

        const clusterLoggingTypeConfigArgsList: awsNative.types.input.eks.ClusterLoggingTypeConfigArgs[] = [
            { type: "api" },
            { type: "audit" },
            { type: "authenticator" },
            { type: "controllerManager" },
            { type: "scheduler" }
        ]
        const clusterLoggingEnabledTypes: awsNative.types.input.eks.ClusterLoggingEnabledTypesArgs = {
            enabledTypes: clusterLoggingTypeConfigArgsList,
        };

        // Create the EKS cluster
        this.eksCluster = new awsNative.eks.Cluster(`aptos`, {
            name: args.clusterName,
            roleArn: args.clusterRoleArn,
            version: args.kubernetesVersion,
            logging: {
                clusterLogging: clusterLoggingEnabledTypes
            },
            resourcesVpcConfig: {
                subnetIds: [...args.publicSubnetIds, ...args.privateSubnetIds],
                publicAccessCidrs: args.k8sApiSources,
                endpointPrivateAccess: true,
                securityGroupIds: [args.securityGroupIdCluster],
            },
        }, {
            parent: this,
            ignoreChanges: [
                // ignore autoupgrade version
                'version',
            ],
        });

        // Create the IAM role for the EKS node group
        this.eksNodeGroupRole = new awsNative.iam.Role(`eksNodeGroupRole`, {
            roleName: `eksNodeGroupRole`,
            path: '/',
            assumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'ec2.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }, { parent: this });

        // Create the EKS node group for utilities
        this.utilitiesNodeGroup = new NodeGroup(`utilities`, {
            name: `utilities`,
            subnetIds: [...args.privateSubnetIds, ...args.publicSubnetIds],
            securityGroupIds: [args.securityGroupIdNodes],
            clusterName: args.clusterName,
            nodeRoleArn: args.nodeRoleArn,
            nodePoolConfig: args.utilitiesNodePool,
            kubernetesVersion: args.kubernetesVersion,
            workspaceName: name,
            tags: args.tags,
        }, { parent: this.eksCluster });

        // Create the EKS node group for validators


        // Attach the Amazon EKS worker node IAM policy to the IAM role
        this.eksNodeGroupRolePolicyAttachment = new aws.iam.RolePolicyAttachment(`eksNodeGroupRolePolicyAttachment`, {
            policyArn: 'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
            role: this.eksNodeGroupRole.roleName.apply(value => value || "")
        }, { parent: this });

        // Attach the Amazon EKS CNI policy to the IAM role
        new aws.iam.RolePolicyAttachment(`eksNodeGroupRolePolicyAttachmentCNI`, {
            policyArn: 'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy',
            role: this.eksNodeGroupRole.roleName.apply(value => value || "")
        }, { parent: this });

        // Create the Amazon EKS add-on for the EBS CSI driver
        this.eksAddon = new awsNative.eks.Addon(`eksAddon`, {
            addonName: 'ebs-csi',
            clusterName: args.clusterName,
            serviceAccountRoleArn: this.eksNodeGroupRole.arn
        }, { parent: this });

        // Create the CloudWatch log group for the EKS cluster
        this.cloudwatchLogGroup = new aws.cloudwatch.LogGroup(`cloudwatchLogGroup`, {
            name: `/aws/eks/${args.clusterName}/cluster`,
            retentionInDays: 7,
        }, { parent: this });

        // Create the launch template for the EKS node group
        this.launchTemplate = new awsNative.ec2.LaunchTemplate(`nodes`, {
            launchTemplateName: `aptos-${name}/nodes`,
            launchTemplateData: {
                blockDeviceMappings: [{
                    deviceName: "/dev/xvda",
                    ebs: {
                        deleteOnTermination: true,
                        volumeSize: 100,
                        volumeType: "gp3"
                    }
                }],
                instanceType: args.instanceType,
                iamInstanceProfile: {
                    arn: this.eksNodeGroupRole.arn
                },
                tagSpecifications: [{
                    resourceType: "instance",
                    // TODO tagging
                    // tags: pulumi.all([args.tags, name]).apply(([tags, name]) => ({
                    //     ...tags,
                    //     Name: `aptos-${name}/nodes`
                    // }))
                }],
            },
        }, { parent: this });

        // Create the OpenID Connect provider for the EKS cluster
        this.openidConnectProvider = new aws.iam.OpenIdConnectProvider(`openidConnectProvider`, {
            clientIdLists: ["sts.amazonaws.com"],
            thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
            url: this.eksCluster.openIdConnectIssuerUrl,
        }, { parent: this });
    }
}

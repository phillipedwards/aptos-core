import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { awsProvider } from './aws';

export interface NodePoolConfig {
    instance_type: pulumi.Input<string>;
    instance_min_num: pulumi.Input<number>;
    instance_num: pulumi.Input<number>;
    instance_max_num: pulumi.Input<number>;
    instance_enable_taint: pulumi.Input<boolean>;
}

interface NodeGroupConfig {
    name: string;
    subnetIds: pulumi.Input<string>[];
    securityGroupIds: pulumi.Input<string>[];
    clusterName: string;
    nodeRoleArn: pulumi.Input<string>;
    // tags?: pulumi.Input<aws.ec2.Tag[]>;
    nodePoolConfig: NodePoolConfig;
    kubernetesVersion: pulumi.Input<string>;
    workspaceName: pulumi.Input<string>;
}

class NodeGroup extends pulumi.ComponentResource {
    public readonly launchTemplate: aws.ec2.LaunchTemplate;
    public readonly nodeGroup: aws.eks.NodeGroup;

    constructor(name: string, args: NodeGroupConfig, opts: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:NodeGroup", name, {}, opts);

        this.launchTemplate = new aws.ec2.LaunchTemplate(`nodes-${name}`, {
            name: `aptos-${args.workspaceName}/${args.name}`,
            instanceType: args.nodePoolConfig.instance_type,
            blockDeviceMappings: [
                {
                    deviceName: "/dev/xvda",
                    ebs: {
                        volumeSize: 100,
                        volumeType: "gp3",
                        deleteOnTermination: 'true',
                    },
                },
            ],
            // TODO tags for resources created by launch template
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

        this.nodeGroup = new aws.eks.NodeGroup(`nodes-${args.name}`, {
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
            // instanceTypes: [args.nodePoolConfig.instance_type],
            launchTemplate: {
                id: this.launchTemplate.id,
                version: pulumi.interpolate`${this.launchTemplate.latestVersion}`,
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
    kubernetesVersion: pulumi.Input<string>;
    privateSubnetIds: pulumi.Input<string>[];
    publicSubnetIds: pulumi.Input<string>[];
    securityGroupIdNodes: pulumi.Input<string>;
    securityGroupIdCluster: pulumi.Input<string>;
    k8sApiSources: pulumi.Input<string>[]
    utilitiesNodePool: NodePoolConfig;
    validatorsNodePool: NodePoolConfig;
    workspaceName: pulumi.Input<string>;
    // tags: pulumi.Input<aws.ec2.Tag[]>;
}

export class Cluster extends pulumi.ComponentResource {
    public readonly eksCluster: aws.eks.Cluster;
    public readonly utilitiesNodeGroup: NodeGroup;
    public readonly validatorsNodeGroup: NodeGroup;
    public readonly ebsDriverRole: aws.iam.Role;
    // public readonly eksNodeGroupRole: aws.iam.Role;
    // public readonly eksNodeGroupRolePolicyAttachment: aws.iam.RolePolicyAttachment;
    public readonly eksAddon: aws.eks.Addon;
    public readonly cloudwatchLogGroup: aws.cloudwatch.LogGroup;
    public readonly openidConnectProvider: aws.iam.OpenIdConnectProvider;

    constructor(name: string, args: ClusterConfig, opts: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Cluster", name, {}, opts);

        // Create the EKS cluster
        this.eksCluster = new aws.eks.Cluster(`aptos`, {
            name: args.clusterName,
            roleArn: args.clusterRoleArn,
            version: args.kubernetesVersion,
            enabledClusterLogTypes: [
                "controllerManager",
                "scheduler",
                "authenticator",
                "audit",
                "api",
            ],
            vpcConfig: {
                subnetIds: [...args.publicSubnetIds, ...args.privateSubnetIds],
                publicAccessCidrs: pulumi.output(args.k8sApiSources),
                endpointPrivateAccess: true,
                securityGroupIds: [args.securityGroupIdCluster],
            },
            // TODO tags
        }, {
            parent: this,
            ignoreChanges: [
                // ignore autoupgrade version
                'version',
            ],
        });

        // Create the OpenID Connect provider for the EKS cluster
        this.openidConnectProvider = new aws.iam.OpenIdConnectProvider(`cluster`, {
            clientIdLists: ["sts.amazonaws.com"],
            thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
            url: this.eksCluster.identities[0].oidcs[0].issuer,
        }, { parent: this });

        const oidcProvider = this.openidConnectProvider.url.apply(url => url.replace("https://", ""));

        const awsEbsCsiDriverTrustPolicy = {
            description: "Trust policy for AWS EBS CSI driver",
            policy: pulumi.output(aws.getCallerIdentity({ provider: awsProvider })).apply(callerIdentity => JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Action: "sts:AssumeRoleWithWebIdentity",
                    Effect: "Allow",
                    Principal: {
                        Federated: pulumi.interpolate`arn:aws:iam::${callerIdentity.accountId}:oidc-provider/${oidcProvider}`,
                    },
                    Condition: {
                        "StringEquals": {
                            "sub": "system:serviceaccount:kube-system:ebs-csi-controller-sa",
                            "sud": "sts.amazonaws.com",
                        },
                    },
                }],
            })),
        };

        this.ebsDriverRole = new aws.iam.Role(`aws-ebs-csi-driver`, {
            name: 'aptos-default-ebs-csi-controller',
            path: '/',
            assumeRolePolicy: JSON.stringify(awsEbsCsiDriverTrustPolicy),
            managedPolicyArns: [
                "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
            ]
        }, { parent: this });

        // // Create the IAM role for the EKS node group
        // this.eksNodeGroupRole = new aws.iam.Role(`eksNodeGroup`, {
        //     name: 'eksNodeGroup',
        //     path: '/',
        //     assumeRolePolicy: JSON.stringify({
        //         Version: '2012-10-17',
        //         Statement: [{
        //             Effect: 'Allow',
        //             Principal: {
        //                 Service: 'ec2.amazonaws.com'
        //             },
        //             Action: 'sts:AssumeRole'
        //         }]
        //     }),
        //     managedPolicyArns: [
        //         "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
        //         "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
        //     ],
        // }, { parent: this });

        // Create the EKS node group for utilities
        this.utilitiesNodeGroup = new NodeGroup(`utilities`, {
            name: `utilities`,
            subnetIds: [args.privateSubnetIds[0]],
            securityGroupIds: [args.securityGroupIdNodes],
            clusterName: args.clusterName,
            nodeRoleArn: args.nodeRoleArn,
            nodePoolConfig: args.utilitiesNodePool,
            kubernetesVersion: args.kubernetesVersion,
            workspaceName: args.workspaceName,
            // tags: args.tags,
        }, { parent: this.eksCluster });

        const clusterName = pulumi.all([this.eksCluster.name, name]).apply(([clusterName, name]) => `${clusterName}-${name}`);

        // Create the EKS node group for validators
        this.validatorsNodeGroup = new NodeGroup(`validators`, {
            name: `validators`,
            subnetIds: [args.privateSubnetIds[0]],
            securityGroupIds: [args.securityGroupIdNodes],
            clusterName: args.clusterName,
            nodeRoleArn: args.nodeRoleArn,
            nodePoolConfig: args.validatorsNodePool,
            kubernetesVersion: args.kubernetesVersion,
            workspaceName: args.workspaceName,
            // tags: args.tags,
        }, { parent: this.eksCluster });

        // // Attach the Amazon EKS worker node IAM policy to the IAM role
        // this.eksNodeGroupRolePolicyAttachment = new aws.iam.RolePolicyAttachment(`eksNodeGroupRolePolicyAttachment`, {
        //     policyArn: 'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
        //     role: this.eksNodeGroupRole.name.apply(value => value || "")
        // }, { parent: this });

        // // Attach the Amazon EKS CNI policy to the IAM role
        // new aws.iam.RolePolicyAttachment(`eksNodeGroupRolePolicyAttachmentCNI`, {
        //     policyArn: 'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy',
        //     role: this.eksNodeGroupRole.name.apply(value => value || "")
        // }, { parent: this });

        // Create the Amazon EKS add-on for the EBS CSI driver
        this.eksAddon = new aws.eks.Addon(`aws-ebs-csi-driver`, {
            addonName: 'aws-ebs-csi-driver',
            clusterName: args.clusterName,
            serviceAccountRoleArn: this.ebsDriverRole.arn
        }, { parent: this });

        // Create the CloudWatch log group for the EKS cluster
        this.cloudwatchLogGroup = new aws.cloudwatch.LogGroup(`eks`, {
            name: `/aws/eks/${args.clusterName}/cluster`,
            retentionInDays: 7,
        }, { parent: this });

        // // Create the launch template for the EKS node group
        // this.launchTemplate = new aws.ec2.LaunchTemplate(`nodes`, {
        //     name: `aptos-${name}/nodes`,
        //     blockDeviceMappings: [{
        //         deviceName: "/dev/xvda",
        //         ebs: {
        //             deleteOnTermination: 'true',
        //             volumeSize: 100,
        //             volumeType: "gp3"
        //         }
        //     }],
        //     instanceType: args.instanceType,
        //     iamInstanceProfile: {
        //         arn: this.eksNodeGroupRole.arn
        //     },
        //     tagSpecifications: [{
        //         resourceType: "instance",
        //         // TODO tagging
        //         // tags: pulumi.all([args.tags, name]).apply(([tags, name]) => ({
        //         //     ...tags,
        //         //     Name: `aptos-${name}/nodes`
        //         // }))
        //     }],
        // }, { parent: this });
    }
}

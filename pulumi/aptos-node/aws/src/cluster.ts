import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export interface NodePoolConfig {
    instanceType: pulumi.Input<string>;
    instanceMinNum: pulumi.Input<number>;
    instanceNum: pulumi.Input<number>;
    instanceMaxNum: pulumi.Input<number>;
    instanceEnableTaint: pulumi.Input<boolean>;
}

export interface NodeGroupConfig {
    name: string;
    nodePoolConfig: NodePoolConfig;
    kubernetesVersion: pulumi.Input<string>;
}

export interface NodeGroupArgs extends NodeGroupConfig {
    clusterName: string;
    subnetIds: pulumi.Input<string>[];
    securityGroupIds: pulumi.Input<string>[];
    nodeRoleArn: pulumi.Input<string>;
    workspaceName: pulumi.Input<string>;
}

class NodeGroup extends pulumi.ComponentResource {
    public readonly launchTemplate: aws.ec2.LaunchTemplate;
    public readonly nodeGroup: aws.eks.NodeGroup;

    constructor(name: string, args: NodeGroupArgs, opts: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:NodeGroup", name, {}, opts);

        const clusterName = `aptos-${args.workspaceName}`;

        this.launchTemplate = new aws.ec2.LaunchTemplate(`nodes-${name}`, {
            name: `aptos-${args.workspaceName}/${args.name}`,
            instanceType: args.nodePoolConfig.instanceType,
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
            tagSpecifications: [
                {
                },
            ],
        }, { parent: this });

        this.nodeGroup = new aws.eks.NodeGroup(`nodes-${args.name}`, {
            clusterName: clusterName,
            nodeGroupName: args.name,
            version: args.kubernetesVersion,
            nodeRoleArn: args.nodeRoleArn,
            subnetIds: args.subnetIds,
            scalingConfig: {
                desiredSize: Number(args.nodePoolConfig.instanceNum),
                maxSize: Number(args.nodePoolConfig.instanceMaxNum),
                minSize: Number(args.nodePoolConfig.instanceMinNum),
            },
            // instanceTypes: [args.nodePoolConfig.instance_type],
            launchTemplate: {
                id: this.launchTemplate.id,
                version: pulumi.interpolate`${this.launchTemplate.latestVersion}`,
            },
            taints: args.nodePoolConfig.instanceEnableTaint ? [
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
    k8sApiSources: pulumi.Input<string>[]
    kubernetesVersion?: pulumi.Input<string>;
    utilitiesNodePool: NodePoolConfig;
    validatorsNodePool: NodePoolConfig;
    // tags: pulumi.Input<aws.ec2.Tag[]>;
}

export interface ClusterArgs extends ClusterConfig {
    clusterRoleArn: pulumi.Input<string>;
    nodeRoleArn: pulumi.Input<string>;
    privateSubnetIds: pulumi.Input<string>[];
    publicSubnetIds: pulumi.Input<string>[];
    securityGroupIdCluster: pulumi.Input<string>;
    securityGroupIdNodes: pulumi.Input<string>;
    workspaceName: pulumi.Input<string>;
}

export class Cluster extends pulumi.ComponentResource {
    public readonly eksCluster: aws.eks.Cluster;
    public readonly utilitiesNodeGroup: NodeGroup;
    public readonly validatorsNodeGroup: NodeGroup;
    public readonly ebsDriverRole: aws.iam.Role;
    public readonly eksAddon: aws.eks.Addon;
    public readonly cloudwatchLogGroup: aws.cloudwatch.LogGroup;
    public readonly openidConnectProvider: aws.iam.OpenIdConnectProvider;

    constructor(name: string, args: ClusterArgs, opts: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Cluster", name, {}, opts);

        const accountId = aws.getCallerIdentity({}).then(it => it.accountId);
        const clusterName = `aptos-${args.workspaceName}`;
        if (!args.kubernetesVersion) { args.kubernetesVersion = "1.24" }

        // Create the EKS cluster
        this.eksCluster = new aws.eks.Cluster(`aptos`, {
            name: clusterName,
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

        const awsEbsCsiDriverTrustPolicy = aws.iam.getPolicyDocumentOutput({
            statements: [{
                effect: "Allow",
                actions: ["sts:AssumeRoleWithWebIdentity"],
                principals: [{
                    type: "Federated",
                    identifiers: [pulumi.interpolate`arn:aws:iam::${accountId}:oidc-provider/${oidcProvider}`],
                }],
                conditions: [{
                    test: "StringEquals",
                    variable: pulumi.interpolate`${oidcProvider}:sub`,
                    values: ["system:serviceaccount:kube-system:ebs-csi-controller-sa"],
                }, {
                    test: "StringEquals",
                    variable: pulumi.interpolate`${oidcProvider}:aud`,
                    values: ["sts.amazonaws.com"],
                }],
            },]

        }, { parent: this });

        this.ebsDriverRole = new aws.iam.Role(`aws-ebs-csi-driver`, {
            name: 'aptos-default-ebs-csi-controller',
            path: '/',
            assumeRolePolicy: awsEbsCsiDriverTrustPolicy.apply(trustPolicy => trustPolicy.json),
            managedPolicyArns: [
                "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
            ]
        }, { parent: this });

        // Create the EKS node group for utilities
        this.utilitiesNodeGroup = new NodeGroup(`utilities`, {
            name: `utilities`,
            subnetIds: [args.privateSubnetIds[0]],
            securityGroupIds: [args.securityGroupIdNodes],
            clusterName: clusterName,
            nodeRoleArn: args.nodeRoleArn,
            nodePoolConfig: args.utilitiesNodePool,
            kubernetesVersion: args.kubernetesVersion,
            workspaceName: args.workspaceName,
            // tags: args.tags,
        }, { parent: this.eksCluster });

        // Create the EKS node group for validators
        this.validatorsNodeGroup = new NodeGroup(`validators`, {
            name: `validators`,
            subnetIds: [args.privateSubnetIds[0]],
            securityGroupIds: [args.securityGroupIdNodes],
            clusterName: clusterName,
            nodeRoleArn: args.nodeRoleArn,
            nodePoolConfig: args.validatorsNodePool,
            kubernetesVersion: args.kubernetesVersion,
            workspaceName: args.workspaceName,
            // tags: args.tags,
        }, { parent: this.eksCluster });

        // Create the Amazon EKS add-on for the EBS CSI driver
        this.eksAddon = new aws.eks.Addon(`aws-ebs-csi-driver`, {
            addonName: 'aws-ebs-csi-driver',
            clusterName: clusterName,
            serviceAccountRoleArn: this.ebsDriverRole.arn,
        }, {
            parent: this,
            aliases: [{
                name: "aws-ebs-csi-driver",
                type: "aws:eks:Addon",
            }],
        });

        // Create the CloudWatch log group for the EKS cluster
        this.cloudwatchLogGroup = new aws.cloudwatch.LogGroup(`eks`, {
            name: `/aws/eks/${clusterName}/cluster`,
            retentionInDays: 7,
        }, { parent: this });
    }
}

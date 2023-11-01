import * as pulumi from "@pulumi/pulumi";
import * as _null from "@pulumi/null";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";
import * as helm from "@pulumi/helm";
import * as kubernetes from "@pulumi/kubernetes";
import * as local from "@pulumi/local";
import * as std from "@pulumi/std";

function notImplemented(message: string) {
    throw new Error(message);
}

interface EksArgs {
    /**
     * AWS region
     */
    region: pulumi.Input<string>,
    /**
     * Version of Kubernetes to use for EKS cluster
     */
    kubernetesVersion?: pulumi.Input<string>,
    /**
     * Name of the eks cluster
     */
    eksClusterName: pulumi.Input<string>,
    /**
     * List of CIDR subnets which can access the Kubernetes API endpoint
     */
    k8sApiSources?: pulumi.Input<any>,
    /**
     * List of AWS usernames to configure as Kubernetes administrators
     */
    k8sAdmins?: pulumi.Input<string[]>,
    /**
     * List of AWS roles to configure as Kubernetes administrators
     */
    k8sAdminRoles?: pulumi.Input<string[]>,
    /**
     * List of AWS usernames to configure as Kubernetes viewers
     */
    k8sViewers?: pulumi.Input<string[]>,
    /**
     * List of AWS roles to configure as Kubernetes viewers
     */
    k8sViewerRoles?: pulumi.Input<string[]>,
    /**
     * List of AWS usernames to configure as Kubernetes debuggers
     */
    k8sDebuggers?: pulumi.Input<string[]>,
    /**
     * List of AWS roles to configure as Kubernetes debuggers
     */
    k8sDebuggerRoles?: pulumi.Input<string[]>,
    /**
     * Path to use when naming IAM objects
     */
    iamPath?: pulumi.Input<string>,
    /**
     * ARN of IAM policy to set as permissions boundary on created roles
     */
    permissionsBoundaryPolicy?: pulumi.Input<string>,
    /**
     * VPC CIDR Block
     */
    vpcCidrBlock?: pulumi.Input<string>,
    /**
     * Instance type used for utilities
     */
    utilityInstanceType?: pulumi.Input<string>,
    /**
     * Instance type used for validator and fullnodes
     */
    fullnodeInstanceType?: pulumi.Input<string>,
    /**
     * Number of fullnodes to deploy
     */
    numFullnodes?: pulumi.Input<number>,
    /**
     * Override the number of nodes in the specified pool
     */
    nodePoolSizes?: pulumi.Input<Record<string, pulumi.Input<number>>>,
    /**
     * If specified, overrides the usage of Terraform workspace for naming purposes
     */
    workspaceNameOverride?: pulumi.Input<string>,
    /**
     * Number of extra instances to add into node pool
     */
    numExtraInstance?: pulumi.Input<number>,
}

export class Eks extends pulumi.ComponentResource {
    public kubernetes: pulumi.Output<any>;
    public vpcId: pulumi.Output<string>;
    public awsSubnetPublic: pulumi.Output<aws.ec2.Subnet>;
    public awsSubnetPrivate: pulumi.Output<aws.ec2.Subnet>;
    public awsVpcCidrBlock: pulumi.Output<string>;
    public awsEipNatPublicIp: pulumi.Output<string>;
    public clusterSecurityGroupId: pulumi.Output<string>;
    constructor(name: string, args: EksArgs, opts?: pulumi.ComponentResourceOptions) {
        super("components:index:Eks", name, args, opts);
        args.kubernetesVersion = args.kubernetesVersion || "1.22";
        args.k8sApiSources = args.k8sApiSources || ["0.0.0.0/0"];
        args.k8sAdmins = args.k8sAdmins || [];
        args.k8sAdminRoles = args.k8sAdminRoles || [];
        args.k8sViewers = args.k8sViewers || [];
        args.k8sViewerRoles = args.k8sViewerRoles || [];
        args.k8sDebuggers = args.k8sDebuggers || [];
        args.k8sDebuggerRoles = args.k8sDebuggerRoles || [];
        args.iamPath = args.iamPath || "/";
        args.permissionsBoundaryPolicy = args.permissionsBoundaryPolicy || "";
        args.vpcCidrBlock = args.vpcCidrBlock || "192.168.0.0/16";
        args.utilityInstanceType = args.utilityInstanceType || "t3.medium";
        args.fullnodeInstanceType = args.fullnodeInstanceType || "c6i.8xlarge";
        args.numFullnodes = args.numFullnodes || 1;
        args.nodePoolSizes = args.nodePoolSizes || {};
        args.workspaceNameOverride = args.workspaceNameOverride || "";
        args.numExtraInstance = args.numExtraInstance || 0;
        const available = aws.getAvailabilityZonesOutput({
            state: "available",
        });

        const awsAvailabilityZones = notImplemented("slice(sort(data.aws_availability_zones.available.names),0,min(3,length(data.aws_availability_zones.available.names)))");

        const workspaceName = args.workspaceNameOverride == "" ? notImplemented("terraform.workspace") : args.workspaceNameOverride;

        const defaultTags = {
            terraform: "fullnode",
            workspace: workspaceName,
        };

        const current = aws.getCallerIdentityOutput({});

        const eks-assume-role = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRole"],
                principals: [{
                    type: "Service",
                    identifiers: ["eks.amazonaws.com"],
                }],
            }],
        });

        const cluster = new aws.iam.Role(`${name}-cluster`, {
            name: `aptos-${workspaceName}-cluster`,
            path: args.iamPath,
            assumeRolePolicy: eks_assume_role.apply(eks_assume_role => eks_assume_role.json),
            permissionsBoundary: args.permissionsBoundaryPolicy,
            tags: defaultTags,
        }, {
            parent: this,
        });

        const cluster_cluster = new aws.iam.RolePolicyAttachment(`${name}-cluster-cluster`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
            role: cluster.name,
        }, {
            parent: this,
        });

        const cluster_service = new aws.iam.RolePolicyAttachment(`${name}-cluster-service`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
            role: cluster.name,
        }, {
            parent: this,
        });

        const ec2-assume-role = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRole"],
                principals: [{
                    type: "Service",
                    identifiers: ["ec2.amazonaws.com"],
                }],
            }],
        });

        const nodes = new aws.iam.Role(`${name}-nodes`, {
            name: `aptos-${workspaceName}-nodes`,
            path: args.iamPath,
            assumeRolePolicy: ec2_assume_role.apply(ec2_assume_role => ec2_assume_role.json),
            permissionsBoundary: args.permissionsBoundaryPolicy,
            tags: defaultTags,
        }, {
            parent: this,
        });

        const nodesResource = new aws.iam.InstanceProfile(`${name}-nodes`, {
            name: `aptos-${workspaceName}-nodes`,
            role: nodes.name,
            path: args.iamPath,
        }, {
            parent: this,
        });

        const nodes_node = new aws.iam.RolePolicyAttachment(`${name}-nodes-node`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            role: nodes.name,
        }, {
            parent: this,
        });

        const nodes_cni = new aws.iam.RolePolicyAttachment(`${name}-nodes-cni`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
            role: nodes.name,
        }, {
            parent: this,
        });

        const nodes_ecr = new aws.iam.RolePolicyAttachment(`${name}-nodes-ecr`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
            role: nodes.name,
        }, {
            parent: this,
        });

        const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
            cidrBlock: args.vpcCidrBlock,
            enableDnsHostnames: true,
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}"
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="shared"
})`),
        }, {
            parent: this,
        });

        const _public: aws.ec2.Subnet[] = [];
        for (const range = {value: 0}; range.value < awsAvailabilityZones.length; range.value++) {
            _public.push(new aws.ec2.Subnet(`${name}-public-${range.value}`, {
                vpcId: vpc.id,
                cidrBlock: std.cidrsubnetOutput({
                    input: std.cidrsubnetOutput({
                        input: vpc.cidrBlock,
                        newbits: 1,
                        netnum: 0,
                    }).apply(invoke => invoke.result),
                    newbits: 2,
                    netnum: range.value,
                }).apply(invoke => invoke.result),
                availabilityZone: awsAvailabilityZones[range.value],
                mapPublicIpOnLaunch: true,
                tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/public-\${local.aws_availability_zones[count.index]}"
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="shared"
"kubernetes.io/role/elb"="1"
})`),
            }, {
            parent: this,
        }));
        }

        const publicResource = new aws.ec2.InternetGateway(`${name}-public`, {
            vpcId: vpc.id,
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}"
})`),
        }, {
            parent: this,
        });

        const publicResource2 = new aws.ec2.RouteTable(`${name}-public`, {
            vpcId: vpc.id,
            routes: [{
                cidrBlock: "0.0.0.0/0",
                gatewayId: publicResource.id,
            }],
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/public"
})`),
        }, {
            parent: this,
        });

        const publicResource3: aws.ec2.RouteTableAssociation[] = [];
        for (const range = {value: 0}; range.value < awsAvailabilityZones.length; range.value++) {
            publicResource3.push(new aws.ec2.RouteTableAssociation(`${name}-public-${range.value}`, {
                subnetId: _public.map(__item => __item.id)[range.value],
                routeTableId: publicResource2.id,
            }, {
            parent: this,
        }));
        }

        const _private: aws.ec2.Subnet[] = [];
        for (const range = {value: 0}; range.value < awsAvailabilityZones.length; range.value++) {
            _private.push(new aws.ec2.Subnet(`${name}-private-${range.value}`, {
                vpcId: vpc.id,
                cidrBlock: std.cidrsubnetOutput({
                    input: std.cidrsubnetOutput({
                        input: vpc.cidrBlock,
                        newbits: 1,
                        netnum: 1,
                    }).apply(invoke => invoke.result),
                    newbits: 2,
                    netnum: range.value,
                }).apply(invoke => invoke.result),
                availabilityZone: awsAvailabilityZones[range.value],
                tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/private-\${local.aws_availability_zones[count.index]}"
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="shared"
"kubernetes.io/role/internal-elb"="1"
})`),
            }, {
            parent: this,
        }));
        }

        const nat = new aws.ec2.Eip(`${name}-nat`, {
            vpc: true,
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}-nat"
})`),
        }, {
            parent: this,
        });

        const privateResource = new aws.ec2.NatGateway(`${name}-private`, {
            allocationId: nat.id,
            subnetId: _public[0].id,
            tags: defaultTags,
        }, {
            parent: this,
        });

        const privateResource2 = new aws.ec2.RouteTable(`${name}-private`, {
            vpcId: vpc.id,
            routes: [{
                cidrBlock: "0.0.0.0/0",
                natGatewayId: privateResource.id,
            }],
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/private"
})`),
        }, {
            parent: this,
        });

        const privateResource3: aws.ec2.RouteTableAssociation[] = [];
        for (const range = {value: 0}; range.value < awsAvailabilityZones.length; range.value++) {
            privateResource3.push(new aws.ec2.RouteTableAssociation(`${name}-private-${range.value}`, {
                subnetId: _private.map(__item => __item.id)[range.value],
                routeTableId: privateResource2.id,
            }, {
            parent: this,
        }));
        }

        const clusterResource2 = new aws.ec2.SecurityGroup(`${name}-cluster`, {
            name: `aptos-${workspaceName}/cluster`,
            description: "k8s masters",
            vpcId: vpc.id,
            tags: notImplemented(`merge(local.default_tags,{
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="owned"
})`),
        }, {
            parent: this,
        });

        const nodesResource4 = new aws.ec2.SecurityGroup(`${name}-nodes`, {
            name: `aptos-${workspaceName}/nodes`,
            description: "k8s nodes",
            vpcId: vpc.id,
            tags: notImplemented(`merge(local.default_tags,{
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="owned"
})`),
        }, {
            parent: this,
        });

        const cluster_api = new aws.ec2.SecurityGroupRule(`${name}-cluster-api`, {
            securityGroupId: clusterResource2.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            sourceSecurityGroupId: nodesResource4.id,
            description: "Allow API traffic from k8s nodes",
        }, {
            parent: this,
        });

        const cluster_kubelet = new aws.ec2.SecurityGroupRule(`${name}-cluster-kubelet`, {
            securityGroupId: clusterResource2.id,
            type: "egress",
            protocol: "tcp",
            fromPort: 10250,
            toPort: 10250,
            sourceSecurityGroupId: nodesResource4.id,
            description: "Allow kubelet traffic to k8s nodes",
        }, {
            parent: this,
        });

        const nodes_tcp = new aws.ec2.SecurityGroupRule(`${name}-nodes-tcp`, {
            securityGroupId: nodesResource4.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 1025,
            toPort: 65535,
            sourceSecurityGroupId: nodesResource4.id,
            description: "Allow TCP traffic between k8s nodes",
        }, {
            parent: this,
        });

        const nodes_udp = new aws.ec2.SecurityGroupRule(`${name}-nodes-udp`, {
            securityGroupId: nodesResource4.id,
            type: "ingress",
            protocol: "udp",
            fromPort: 1025,
            toPort: 65535,
            sourceSecurityGroupId: nodesResource4.id,
            description: "Allow UDP traffic between k8s nodes",
        }, {
            parent: this,
        });

        const nodes_icmp = new aws.ec2.SecurityGroupRule(`${name}-nodes-icmp`, {
            securityGroupId: nodesResource4.id,
            type: "ingress",
            protocol: "icmp",
            fromPort: -1,
            toPort: -1,
            sourceSecurityGroupId: nodesResource4.id,
            description: "Allow ICMP traffic between k8s nodes",
        }, {
            parent: this,
        });

        const nodes_dns = new aws.ec2.SecurityGroupRule(`${name}-nodes-dns`, {
            securityGroupId: nodesResource4.id,
            type: "ingress",
            protocol: "udp",
            fromPort: 53,
            toPort: 53,
            sourceSecurityGroupId: nodesResource4.id,
            description: "Allow DNS traffic between k8s nodes",
        }, {
            parent: this,
        });

        const nodes_kubelet = new aws.ec2.SecurityGroupRule(`${name}-nodes-kubelet`, {
            securityGroupId: nodesResource4.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 10250,
            toPort: 10250,
            sourceSecurityGroupId: clusterResource2.id,
            description: "Allow kubelet traffic from k8s masters",
        }, {
            parent: this,
        });

        const nodes_egress = new aws.ec2.SecurityGroupRule(`${name}-nodes-egress`, {
            securityGroupId: nodesResource4.id,
            type: "egress",
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow all outgoing traffic",
        }, {
            parent: this,
        });

        const eks = new aws.cloudwatch.LogGroup(`${name}-eks`, {
            name: `/aws/eks/aptos-${workspaceName}/cluster`,
            retentionInDays: 7,
            tags: defaultTags,
        }, {
            parent: this,
        });

        const aptosResource = new aws.eks.Cluster(`${name}-aptos`, {
            name: args.eksClusterName,
            roleArn: cluster.arn,
            version: args.kubernetesVersion,
            enabledClusterLogTypes: [
                "api",
                "audit",
                "authenticator",
                "controllerManager",
                "scheduler",
            ],
            tags: defaultTags,
            vpcConfig: {
                subnetIds: std.concatOutput({
                    input: [
                        _public.map(__item => __item.id),
                        _private.map(__item => __item.id),
                    ],
                }).apply(invoke => invoke.result),
                publicAccessCidrs: args.k8sApiSources,
                endpointPrivateAccess: true,
                securityGroupIds: [clusterResource2.id],
            },
        }, {
            parent: this,
        });

        const aptos = aws.eks.getClusterAuthOutput({
            name: aptosResource.name,
        });

        const pools = {
            utilities: {
                instanceType: args.utilityInstanceType,
                size: 1,
                taint: false,
            },
            fullnode: {
                instanceType: args.fullnodeInstanceType,
                size: args.numFullnodes + args.numExtraInstance,
                taint: false,
            },
        };

        const nodesResource2: aws.ec2.LaunchTemplate[] = [];
        for (const range of Object.entries(pools).map(([k, v]) => ({key: k, value: v}))) {
            nodesResource2.push(new aws.ec2.LaunchTemplate(`${name}-nodes-${range.key}`, {
                name: `aptos-${workspaceName}/${range.key}`,
                instanceType: range.value.instanceType,
                blockDeviceMappings: [{
                    deviceName: "/dev/xvda",
                    ebs: {
                        deleteOnTermination: "true",
                        volumeSize: 100,
                        volumeType: "gp3",
                    },
                }],
                tagSpecifications: [{
                    resourceType: "instance",
                    tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/\${each.key}",
})`),
                }],
            }, {
            parent: this,
        }));
        }

        const nodesResource3: aws.eks.NodeGroup[] = [];
        for (const range of Object.entries(pools).map(([k, v]) => ({key: k, value: v}))) {
            nodesResource3.push(new aws.eks.NodeGroup(`${name}-nodes-${range.key}`, {
                clusterName: aptosResource.name,
                nodeGroupName: range.key,
                version: aptosResource.version,
                nodeRoleArn: nodes.arn,
                subnetIds: [_private[0].id],
                tags: defaultTags,
                launchTemplate: {
                    id: nodesResource2[range.key].id,
                    version: nodesResource2[range.key].latestVersion,
                },
                scalingConfig: {
                    desiredSize: notImplemented("lookup(var.node_pool_sizes,each.key,each.value.size)"),
                    minSize: 1,
                    maxSize: notImplemented("lookup(var.node_pool_sizes,each.key,each.value.size)") * 2,
                },
                updateConfig: {
                    maxUnavailablePercentage: 50,
                },
            }, {
            parent: this,
        }));
        }

        const clusterResource = new aws.iam.OpenIdConnectProvider(`${name}-cluster`, {
            clientIdLists: ["sts.amazonaws.com"],
            thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
            url: aptosResource.identities.apply(identities => identities[0].oidcs?.[0]?.issuer),
        }, {
            parent: this,
        });

        const oidcProvider = notImplemented("replace(aws_iam_openid_connect_provider.cluster.url,\"https://\",\"\")");

        const aws-ebs-csi-driver-trust-policy = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRoleWithWebIdentity"],
                principals: [{
                    type: "Federated",
                    identifiers: [current.apply(current => `arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
                }],
                conditions: [
                    {
                        test: "StringEquals",
                        variable: `${oidcProvider}:sub`,
                        values: ["system:serviceaccount:kube-system:ebs-csi-controller-sa"],
                    },
                    {
                        test: "StringEquals",
                        variable: `${oidcProvider}:aud`,
                        values: ["sts.amazonaws.com"],
                    },
                ],
            }],
        });

        const aws_ebs_csi_driver = new aws.iam.Role(`${name}-aws-ebs-csi-driver`, {
            name: `aptos-${workspaceName}-ebs-csi-controller`,
            path: args.iamPath,
            permissionsBoundary: args.permissionsBoundaryPolicy,
            assumeRolePolicy: aws_ebs_csi_driver_trust_policy.apply(aws_ebs_csi_driver_trust_policy => aws_ebs_csi_driver_trust_policy.json),
        }, {
            parent: this,
        });

        const caws_ebs_csi_driver = new aws.iam.RolePolicyAttachment(`${name}-caws-ebs-csi-driver`, {
            role: aws_ebs_csi_driver.name,
            policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
        }, {
            parent: this,
        });

        const aws_ebs_csi_driverResource = new aws.eks.Addon(`${name}-aws-ebs-csi-driver`, {
            clusterName: aptosResource.name,
            addonName: "aws-ebs-csi-driver",
            serviceAccountRoleArn: aws_ebs_csi_driver.arn,
        }, {
            parent: this,
        });

        const cluster-autoscaler-assume-role = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRoleWithWebIdentity"],
                principals: [{
                    type: "Federated",
                    identifiers: [current.apply(current => `arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
                }],
                conditions: [
                    {
                        test: "StringEquals",
                        variable: `${oidcProvider}:sub`,
                        values: ["system:serviceaccount:kube-system:cluster-autoscaler"],
                    },
                    {
                        test: "StringEquals",
                        variable: `${oidcProvider}:aud`,
                        values: ["sts.amazonaws.com"],
                    },
                ],
            }],
        });

        const cluster-autoscaler = aws.iam.getPolicyDocumentOutput({
            statements: [
                {
                    sid: "Autoscaling",
                    actions: [
                        "autoscaling:SetDesiredCapacity",
                        "autoscaling:TerminateInstanceInAutoScalingGroup",
                    ],
                    resources: ["*"],
                    conditions: [{
                        test: "StringEquals",
                        variable: pulumi.interpolate`aws:ResourceTag/k8s.io/cluster-autoscaler/${aptosResource.name}`,
                        values: ["owned"],
                    }],
                },
                {
                    sid: "DescribeAutoscaling",
                    actions: [
                        "autoscaling:DescribeAutoScalingInstances",
                        "autoscaling:DescribeAutoScalingGroups",
                        "ec2:DescribeLaunchTemplateVersions",
                        "autoscaling:DescribeTags",
                        "autoscaling:DescribeLaunchConfigurations",
                    ],
                    resources: ["*"],
                },
            ],
        });

        const cluster_autoscalerResource = new aws.iam.Role(`${name}-cluster-autoscaler`, {
            name: `aptos-fullnode-${workspaceName}-cluster-autoscaler`,
            path: args.iamPath,
            permissionsBoundary: args.permissionsBoundaryPolicy,
            assumeRolePolicy: cluster_autoscaler_assume_role.apply(cluster_autoscaler_assume_role => cluster_autoscaler_assume_role.json),
        }, {
            parent: this,
        });

        const cluster_autoscalerResource2 = new aws.iam.RolePolicy(`${name}-cluster-autoscaler`, {
            name: "Helm",
            role: cluster_autoscalerResource.name,
            policy: cluster_autoscaler.apply(cluster_autoscaler => cluster_autoscaler.json),
        }, {
            parent: this,
        });

        const autoscalingHelmChartPath = `${notImplemented("path.module")}/../../helm/autoscaling`;

        const autoscaling = new helm.index.Release(`${name}-autoscaling`, {
            name: "autoscaling",
            namespace: "kube-system",
            chart: autoscalingHelmChartPath,
            maxHistory: 5,
            wait: false,
            values: [JSON.stringify({
                autoscaler: {
                    enabled: true,
                    clusterName: aptosResource.name,
                    image: {
                        tag: `v${aptosResource.version}.0`,
                    },
                    serviceAccount: {
                        annotations: {
                            "eks.amazonaws.com/role-arn": cluster_autoscalerResource.arn,
                        },
                    },
                },
            })],
            set: [{
                name: "chart_sha1",
                value: std.sha1Output({
                    input: std.joinOutput({
                        separator: "",
                        input: .map(f => (std.filesha1Output({
                            input: `${autoscalingHelmChartPath}/${f}`,
                        }).result)),
                    }).result,
                }).result,
            }],
        }, {
            parent: this,
        });

        const io1 = new kubernetes.storage.v1.StorageClass(`${name}-io1`, {
            metadata: {
                name: "io1",
            },
            storageProvisioner: "kubernetes.io/aws-ebs",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "io1",
                iopsPerGB: "50",
            },
        }, {
            parent: this,
        });

        const gp3 = new kubernetes.storage.v1.StorageClass(`${name}-gp3`, {
            metadata: {
                name: "gp3",
                annotations: {
                    "storageclass.kubernetes.io/is-default-class": "false",
                },
            },
            storageProvisioner: "ebs.csi.aws.com",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "gp3",
            },
        }, {
            parent: this,
        });

        const io2 = new kubernetes.storage.v1.StorageClass(`${name}-io2`, {
            metadata: {
                name: "io2",
            },
            storageProvisioner: "ebs.csi.aws.com",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "io2",
                iops: "40000",
            },
        }, {
            parent: this,
        });

        const delete_gp2 = new _null.Resource(`${name}-delete-gp2`, {}, {
            parent: this,
        });

        const kubeconfig = std.md5Output({
            input: std.timestampOutput({}).apply(invoke => invoke.result),
        }).apply(invoke => `/tmp/kube.config.${invoke.result}`);

        const delete_gp2Provisioner0 = new command.local.Command(`${name}-delete-gp2Provisioner0`, {create: pulumi.interpolate`aws --region ${args.region} eks update-kubeconfig --name ${aptosResource.name} --kubeconfig ${kubeconfig} &&
kubectl --kubeconfig ${kubeconfig} delete --ignore-not-found storageclass gp2
`}, {
            parent: this,
            dependsOn: [delete_gp2],
        });

        const gp2 = new kubernetes.storage.v1.StorageClass(`${name}-gp2`, {
            metadata: {
                name: "gp2",
                annotations: {
                    "storageclass.kubernetes.io/is-default-class": "true",
                },
            },
            storageProvisioner: "kubernetes.io/aws-ebs",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "gp2",
            },
        }, {
            parent: this,
        });

        // FIXME: Remove when migrating to K8s 1.25
        const psp_kube_system = new kubernetes.rbac.v1.RoleBinding(`${name}-psp-kube-system`, {
            metadata: {
                name: "eks:podsecuritypolicy:privileged",
                namespace: "kube-system",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "eks:podsecuritypolicy:privileged",
            },
            subject: [{
                apiGroup: "rbac.authorization.k8s.io",
                kind: "Group",
                name: "system:serviceaccounts:kube-system",
            }],
        }, {
            parent: this,
        });

        // FIXME: Remove when migrating to K8s 1.25
        const delete_psp_authenticated = new _null.Resource(`${name}-delete-psp-authenticated`, {}, {
            parent: this,
        });

        const delete_psp_authenticatedProvisioner0 = new command.local.Command(`${name}-delete-psp-authenticatedProvisioner0`, {create: pulumi.interpolate`aws --region ${args.region} eks update-kubeconfig --name ${aptosResource.name} --kubeconfig ${kubeconfig} &&
kubectl --kubeconfig ${kubeconfig} delete --ignore-not-found clusterrolebinding eks:podsecuritypolicy:authenticated
`}, {
            parent: this,
            dependsOn: [delete_psp_authenticated],
        });

        const tigera_operator = new kubernetes.core.v1.Namespace(`${name}-tigera-operator`, {metadata: {
            annotations: {
                name: "tigera-operator",
            },
            name: "tigera-operator",
        }}, {
            parent: this,
        });

        const calico = new helm.index.Release(`${name}-calico`, {
            name: "calico",
            repository: "https://docs.projectcalico.org/charts",
            chart: "tigera-operator",
            version: "3.23.3",
            namespace: "tigera-operator",
        }, {
            parent: this,
        });

        const debug = new kubernetes.rbac.v1.ClusterRole(`${name}-debug`, {
            metadata: {
                name: "debug",
            },
            rule: [{
                apiGroups: [""],
                resources: [
                    "pods/portforward",
                    "pods/exec",
                ],
                verbs: ["create"],
            }],
        }, {
            parent: this,
        });

        const debuggers = new kubernetes.rbac.v1.RoleBinding(`${name}-debuggers`, {
            metadata: {
                name: "debuggers",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: debug.metadata.apply(metadata => metadata.name),
            },
            subject: [{
                kind: "Group",
                name: "debuggers",
            }],
        }, {
            parent: this,
        });

        const viewers = new kubernetes.rbac.v1.RoleBinding(`${name}-viewers`, {
            metadata: {
                name: "viewers",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "view",
            },
            subject: [
                {
                    kind: "Group",
                    name: "viewers",
                },
                {
                    kind: "Group",
                    name: "debuggers",
                },
            ],
        }, {
            parent: this,
        });

        const aws_auth = new kubernetes.core.v1.ConfigMap(`${name}-aws-auth`, {
            metadata: {
                name: "aws-auth",
                namespace: "kube-system",
            },
            data: {
                mapRoles: notImplemented(`yamlencode(concat(
[{
rolearn=aws_iam_role.nodes.arn
username="system:node:{{EC2PrivateDNSName}}"
groups=["system:bootstrappers","system:nodes"]
}],
var.iam_path=="/"?[]:[{
# Workaround for https://github.com/kubernetes-sigs/aws-iam-authenticator/issues/268
# The entry above is still needed otherwise EKS marks the node group as unhealthy
rolearn=replace(aws_iam_role.nodes.arn,"role\${var.iam_path}","role/")
username="system:node:{{EC2PrivateDNSName}}"
groups=["system:bootstrappers","system:nodes"]
}],
[forroleinvar.k8s_admin_roles:{
rolearn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/\${role}"
username="\${role}:{{SessionName}}"
groups=["system:masters"]
}],
[forroleinvar.k8s_viewer_roles:{
rolearn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/\${role}"
username="\${role}:{{SessionName}}"
groups=["viewers"]
}],
[forroleinvar.k8s_debugger_roles:{
rolearn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/\${role}"
username="\${role}:{{SessionName}}"
groups=["debuggers"]
}],
))`),
                mapUsers: notImplemented(`yamlencode(concat(
[foruserinvar.k8s_admins:{
userarn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:user/\${user}"
username=user
groups=["system:masters"]
}],
[foruserinvar.k8s_viewers:{
userarn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:user/\${user}"
username=user
groups=["viewers"]
}],
[foruserinvar.k8s_debuggers:{
userarn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:user/\${user}"
username=user
groups=["debuggers"]
}],
))`),
            },
        }, {
            parent: this,
        });

        const kubernetes = new local.File(`${name}-kubernetes`, {
            filename: `${workspaceName}-kubernetes.json`,
            content: pulumi.all([aptosResource.endpoint, std.base64decodeOutput({
                input: aptosResource.certificateAuthority.apply(certificateAuthority => certificateAuthority.data),
            }), aptosResource.identities]).apply(([endpoint, invoke, identities]) => JSON.stringify({
                kubernetesHost: endpoint,
                kubernetesCaCert: invoke.result,
                issuer: identities[0].oidcs?.[0]?.issuer,
                serviceAccountPrefix: "aptos-pfn",
                podCidrs: _private.map(__item => __item.cidrBlock),
            })),
            filePermission: "0644",
        }, {
            parent: this,
        });

        this.kubernetes = notImplemented("jsondecode(local_file.kubernetes.content)");
        this.vpcId = vpc.id;
        this.awsSubnetPublic = pulumi.output(_public);
        this.awsSubnetPrivate = pulumi.output(_private);
        this.awsVpcCidrBlock = vpc.cidrBlock;
        this.awsEipNatPublicIp = nat.publicIp;
        this.clusterSecurityGroupId = clusterResource2.id;
        this.registerOutputs({
            kubernetes: notImplemented("jsondecode(local_file.kubernetes.content)"),
            vpcId: vpc.id,
            awsSubnetPublic: _public,
            awsSubnetPrivate: _private,
            awsVpcCidrBlock: vpc.cidrBlock,
            awsEipNatPublicIp: nat.publicIp,
            clusterSecurityGroupId: clusterResource2.id,
        });
    }
}

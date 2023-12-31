import * as k8sClientLib from '@kubernetes/client-node';
import * as aws from "@pulumi/aws";
import { local } from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as std from "@pulumi/std";
import * as awsSdk from "aws-sdk";
import * as fs from "fs";
import * as path from 'path';
import * as yaml from "yaml";
import * as defaults from "../../../config/defaults";
import {
    computeSha1ForHelmRelease,
    setAWSProviderOnEachAWSResource,
} from "../../../lib/helpers"
import { getK8sProviderFromEksCluster, getKubeconfigFromEksCluster } from "../../../lib/awsEksKubeConfig"

export interface awsEksClusterArgs {
    awsProvider: aws.Provider;
    eksClusterName: pulumi.Input<string>;
    region: pulumi.Input<string>;
    fullnodeInstanceType?: pulumi.Input<string>;
    iamPath?: pulumi.Input<string>;
    k8sAdminRoles?: pulumi.Input<string>[];
    k8sAdmins?: pulumi.Input<string>[];
    k8sApiSources?: pulumi.Input<string>[];
    k8sDebuggerRoles?: pulumi.Input<string>[];
    k8sDebuggers?: pulumi.Input<string>[];
    k8sDefaultProviderAlias?: pulumi.Input<string>;
    k8sViewerRoles?: pulumi.Input<string>[];
    k8sViewers?: pulumi.Input<string>[];
    kubernetesVersion?: pulumi.Input<string>;
    nodePoolSizes?: Map<string, pulumi.Input<number>>;
    numExtraInstance?: pulumi.Input<number>;
    numFullnodes?: pulumi.Input<number>;
    permissionsBoundaryPolicy?: pulumi.Input<string>;
    utilityInstanceType?: pulumi.Input<string>;
    vpcCidrBlock?: pulumi.Input<string>;
    workspaceNameOverride?: pulumi.Input<string>;
    manageViaPulumi?: pulumi.Input<boolean>;
}

export class awsEksCluster extends pulumi.ComponentResource {

    // public cwLogGroupForEks: aws.cloudwatch.LogGroup
    public eipForNat: aws.ec2.Eip
    public eksAddonEbsCsiDriver: aws.eks.Addon
    public eksCluster: aws.eks.Cluster
    public readonly iamInstanceProfileForNodes: aws.iam.InstanceProfile
    public iamRoleAttachEbsCsiDriver: aws.iam.RolePolicyAttachment
    public readonly iamRoleForCluster: aws.iam.Role
    public iamRoleForClusterAutoscaler: aws.iam.Role
    public iamRoleForEbsCsiDriver: aws.iam.Role
    public readonly iamRoleForNodes: aws.iam.Role
    public iamRolePolicyClusterAutoscaler: aws.iam.RolePolicy
    public igw: aws.ec2.InternetGateway
    public k8sRoleBindingForDebuggers: k8s.rbac.v1.RoleBinding;
    public k8sRoleBindingForViewers: k8s.rbac.v1.RoleBinding;
    public k8sRoleForDebug: k8s.rbac.v1.ClusterRole;
    public readonly launchTemplateForNodes: aws.ec2.LaunchTemplate[]
    public readonly routeTableForPublic: aws.ec2.RouteTable
    public securityGroupForCluster: aws.ec2.SecurityGroup
    public securityGroupForNodes: aws.ec2.SecurityGroup
    public readonly subnetsForPrivate: aws.ec2.Subnet[]
    public readonly subnetsForPublic: aws.ec2.Subnet[]
    public readonly vpc: aws.ec2.Vpc
    public k8sStorageClassForIo1: k8s.storage.v1.StorageClass;
    public k8sStorageClassForGp3: k8s.storage.v1.StorageClass;
    public k8sStorageClassForGp2: k8s.storage.v1.StorageClass;
    public k8sStorageClassForIo2: k8s.storage.v1.StorageClass;
    public readonly nodeGroupForNodes: aws.eks.NodeGroup[];
    public readonly rtAssociationsForPublic: aws.ec2.RouteTableAssociation[];
    public readonly rtAssociationsForPrivate: aws.ec2.RouteTableAssociation[];
    public awsAuthConfigMap: k8s.core.v1.ConfigMap;

    constructor(name: string, args: awsEksClusterArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-components:aws:awsEksCluster", name, opts);

        const awsConfig = new pulumi.Config("aws");
        const config = new pulumi.Config();


        const awsAvailabilityZones = aws.getAvailabilityZones({
        }, { parent: this, provider: args.awsProvider });

        args.fullnodeInstanceType = (args.fullnodeInstanceType || args.fullnodeInstanceType !== "") ? args.fullnodeInstanceType : "c6i.8xlarge";
        args.iamPath = (args.iamPath || args.iamPath !== "") ? args.iamPath : "/";
        args.k8sAdminRoles = (args.k8sAdminRoles) ? args.k8sAdminRoles : [];
        args.k8sAdmins = (args.k8sAdmins) ? args.k8sAdmins : [];
        args.k8sApiSources = (args.k8sApiSources) ? args.k8sApiSources : ["0.0.0.0/0"];
        args.k8sDebuggerRoles = (args.k8sDebuggerRoles) ? args.k8sDebuggerRoles : [];
        args.k8sDebuggers = (args.k8sDebuggers) ? args.k8sDebuggers : [];
        args.k8sViewerRoles = (args.k8sViewerRoles) ? args.k8sViewerRoles : [];
        args.k8sViewers = (args.k8sViewers) ? args.k8sViewers : [];
        args.kubernetesVersion = (args.kubernetesVersion || args.kubernetesVersion !== "") ? args.kubernetesVersion : "1.22";
        args.numFullnodes = (args.numFullnodes) ? args.numFullnodes : 1;
        args.permissionsBoundaryPolicy = (args.permissionsBoundaryPolicy || args.permissionsBoundaryPolicy !== "") ? args.permissionsBoundaryPolicy : "";
        args.utilityInstanceType = (args.utilityInstanceType || args.utilityInstanceType !== "") ? args.utilityInstanceType : "t3.medium";
        args.vpcCidrBlock = args.vpcCidrBlock ? args.vpcCidrBlock : "192.168.0.0/16";
        args.nodePoolSizes = args.nodePoolSizes ? args.nodePoolSizes : new Map<string, number>([
            ['utilities', 1],
            ['fullnode', 1]
        ]);
        args.workspaceNameOverride = (args.workspaceNameOverride || args.workspaceNameOverride !== "") ? args.workspaceNameOverride : "";
        args.numExtraInstance = (args.numExtraInstance) ? args.numExtraInstance : 0;
        args.manageViaPulumi = (args.manageViaPulumi) ? args.manageViaPulumi : true;

        this.launchTemplateForNodes = []
        this.subnetsForPrivate = []
        this.subnetsForPublic = []
        this.nodeGroupForNodes = []
        this.rtAssociationsForPublic = []
        this.rtAssociationsForPrivate = []
        // this.cwLogGroupForEks = undefined as any;
        this.eipForNat = undefined as any;
        this.eksCluster = undefined as any;
        this.securityGroupForCluster = undefined as any;
        this.securityGroupForNodes = undefined as any;
        this.iamRoleForEbsCsiDriver = undefined as any;
        this.iamRoleAttachEbsCsiDriver = undefined as any;
        this.eksAddonEbsCsiDriver = undefined as any;
        this.iamRoleForClusterAutoscaler = undefined as any;
        this.iamRolePolicyClusterAutoscaler = undefined as any;
        this.k8sRoleBindingForDebuggers = undefined as any;
        this.k8sRoleBindingForViewers = undefined as any;
        this.k8sRoleForDebug = undefined as any;
        this.k8sStorageClassForIo1 = undefined as any;
        this.k8sStorageClassForGp3 = undefined as any;
        this.k8sStorageClassForGp2 = undefined as any;
        this.k8sStorageClassForIo2 = undefined as any;
        this.awsAuthConfigMap = undefined as any;


        const workspaceName = (args.workspaceNameOverride || args.workspaceNameOverride !== "") ? args.workspaceNameOverride : pulumi.getStack();
        const defaultTags = {
            terraform: "fullnode",
            workspace: workspaceName,
        };

        pulumi.log.info(`Registering setAWSProviderOnEachAWSResource transformation`);
        pulumi.runtime.registerStackTransformation(setAWSProviderOnEachAWSResource(args.awsProvider));

        const currentAwsCallerIdentity = aws.getCallerIdentityOutput({}, { parent: this, provider: args.awsProvider });
        const accountId = currentAwsCallerIdentity.accountId;

        const region = awsConfig.require("region") || process.env.AWS_REGION;
        const profile = awsConfig.require("profile") || process.env.AWS_REGION;
        const defaultProviderConfig = new pulumi.Config("awsDefaultProvider");
        // const k8sDefaultProviderAlias = defaultProviderConfig.get("k8sDefaultProviderAlias");

        const iamDocForClusterRoleAssumption = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRole"],
                principals: [{
                    type: "Service",
                    identifiers: ["eks.amazonaws.com"],
                }],
            }],
        }, {
            parent: this,
            provider: args.awsProvider,
        });

        this.iamRoleForCluster = new aws.iam.Role("cluster", {
            name: pulumi.interpolate`aptos-${workspaceName}-cluster`,
            path: args.iamPath,
            assumeRolePolicy: iamDocForClusterRoleAssumption.apply(eks_assume_role => eks_assume_role.json),
            permissionsBoundary: args.permissionsBoundaryPolicy,
            // tags: defaultTags,
        }, { parent: this });

        const iamRolePolAttachClusterToCluster = new aws.iam.RolePolicyAttachment("cluster-cluster", {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
            role: this.iamRoleForCluster.name,
        }, { parent: this.iamRoleForCluster });

        const iamRolePolAttachClusterToService = new aws.iam.RolePolicyAttachment("cluster-service", {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
            role: this.iamRoleForCluster.name,
        }, { parent: this.iamRoleForCluster });

        const iamDocForNodesRoleAssumption = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRole"],
                principals: [{
                    type: "Service",
                    identifiers: ["ec2.amazonaws.com"],
                }],
            }],
        }, {
            parent: this,
            provider: args.awsProvider,
        });

        this.iamRoleForNodes = new aws.iam.Role("nodes", {
            name: pulumi.interpolate`aptos-${workspaceName}-nodes`,
            path: args.iamPath,
            assumeRolePolicy: iamDocForNodesRoleAssumption.apply(ec2AssumeRole => ec2AssumeRole.json),
            permissionsBoundary: args.permissionsBoundaryPolicy,
        }, { parent: this });

        this.iamInstanceProfileForNodes = new aws.iam.InstanceProfile("nodes", {
            name: pulumi.interpolate`aptos-${workspaceName}-nodes`,
            role: this.iamRoleForNodes.name,
            path: args.iamPath,
        }, { parent: this.iamRoleForNodes });

        const iamRolePolAttachNodesToNode = new aws.iam.RolePolicyAttachment("nodes-node", {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            role: this.iamRoleForNodes.name,
        }, { parent: this.iamRoleForNodes });

        const iamRolePolAttachNodesToCni = new aws.iam.RolePolicyAttachment("nodes-cni", {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
            role: this.iamRoleForNodes.name,
        }, { parent: this.iamRoleForNodes });

        const iamRolePolAttachNodesToEcr = new aws.iam.RolePolicyAttachment("nodes-ecr", {
            policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
            role: this.iamRoleForNodes.name,
        }, { parent: this.iamRoleForNodes });

        const k8sioClusterTagKey = pulumi.interpolate`k8s.io/cluster/aptos-${workspaceName}`
        this.vpc = new aws.ec2.Vpc("vpc", {
            cidrBlock: args.vpcCidrBlock,
            enableDnsHostnames: true,
            tags: {
                Name: pulumi.interpolate`aptos-${workspaceName}`,
            },
        }, { parent: this });

        const vpcK8sTag = new aws.ec2.Tag("k8s.io/cluster/aptos-${workspaceName}-vpc", {
            resourceId: this.vpc.id,
            key: k8sioClusterTagKey,
            value: "shared",
        }, { parent: this.vpc });

        this.eipForNat = new aws.ec2.Eip("nat", {
            vpc: true,
            tags: {
                Name: pulumi.interpolate`aptos-${workspaceName}-nat`,
            },
        }, { parent: this.vpc });

        this.igw = new aws.ec2.InternetGateway("public", {
            vpcId: this.vpc.id,
            tags: {
                Name: pulumi.interpolate`aptos-${workspaceName}`,
            },
        }, { parent: this.vpc });

        this.routeTableForPublic = new aws.ec2.RouteTable("public", {
            vpcId: this.vpc.id,
            routes: [{
                cidrBlock: "0.0.0.0/0",
                gatewayId: this.igw.id,
            }],
            tags: {
                Name: pulumi.interpolate`aptos-${workspaceName}/public`,
            },
        }, { parent: this.vpc });

        awsAvailabilityZones.then(awsAvailabilityZones => {
            for (const range = { value: 0 }; range.value < awsAvailabilityZones.zoneIds.length; range.value++) {
                this.subnetsForPublic.push(new aws.ec2.Subnet(`public-${range.value}`, {
                    vpcId: this.vpc.id,
                    cidrBlock: std.cidrsubnetOutput({
                        input: std.cidrsubnetOutput({
                            input: this.vpc.cidrBlock,
                            newbits: 1,
                            netnum: 0,
                        }).apply(invoke => invoke.result),
                        newbits: 2,
                        netnum: range.value,
                    }).apply(invoke => invoke.result),
                    availabilityZone: awsAvailabilityZones.names[range.value],
                    mapPublicIpOnLaunch: true,
                    tags: {
                        Name: pulumi.interpolate`aptos-${workspaceName}/public-${range.value}`,
                    }
                }, { parent: this.vpc }));

                new aws.ec2.Tag(`k8s.io/cluster/aptos-${workspaceName}-public-subnet-${range.value}`, {
                    resourceId: this.subnetsForPublic[range.value].id,
                    key: k8sioClusterTagKey,
                    value: "shared",
                }, { parent: this.subnetsForPublic[range.value] });

                new aws.ec2.Tag(`k8s.io/role/elb-${range.value}`, {
                    resourceId: this.subnetsForPublic[range.value].id,
                    key: "k8s.io/role/elb",
                    value: "1",
                }, { parent: this.subnetsForPublic[range.value] });
            }

            for (const range = { value: 0 }; range.value < awsAvailabilityZones.zoneIds.length; range.value++) {
                this.rtAssociationsForPublic.push(new aws.ec2.RouteTableAssociation(`public-${range.value}`, {
                    subnetId: this.subnetsForPublic.map(__item => __item.id)[range.value],
                    routeTableId: this.routeTableForPublic.id,
                }, { parent: this.subnetsForPublic[range.value] }));
            }

            for (const range = { value: 0 }; range.value < awsAvailabilityZones.zoneIds.length; range.value++) {
                this.subnetsForPrivate.push(new aws.ec2.Subnet(`private-${range.value}`, {
                    vpcId: this.vpc.id,
                    cidrBlock: std.cidrsubnetOutput({
                        input: std.cidrsubnetOutput({
                            input: this.vpc.cidrBlock,
                            newbits: 1,
                            netnum: 1,
                        }).apply(invoke => invoke.result),
                        newbits: 2,
                        netnum: range.value,
                    }).apply(invoke => invoke.result),
                    availabilityZone: awsAvailabilityZones.names[range.value],
                    tags: {
                        Name: pulumi.interpolate`aptos-${workspaceName}/private-${range.value}`,
                    },
                }, { parent: this.vpc }));

                new aws.ec2.Tag(`k8s.io/cluster/aptos-${workspaceName}-private-subnet-${range.value}`, {
                    resourceId: this.subnetsForPrivate[range.value].id,
                    key: k8sioClusterTagKey,
                    value: "shared",
                }, { parent: this.subnetsForPrivate[range.value] });

                new aws.ec2.Tag(`k8s.io/role/internal-elb-${range.value}`, {
                    resourceId: this.subnetsForPrivate[range.value].id,
                    key: "k8s.io/role/internal-elb",
                    value: "1",
                }, { parent: this.subnetsForPrivate[range.value] });
            }

            pulumi.all([this.subnetsForPrivate, this.subnetsForPublic]).apply(([privates, publics]) => {
                const natGw = new aws.ec2.NatGateway("private", {
                    allocationId: this.eipForNat.id,
                    subnetId: this.subnetsForPublic[0].id,
                }, { parent: this.vpc });

                const routeTableForPrivate = new aws.ec2.RouteTable("private", {
                    vpcId: this.vpc.id,
                    routes: [{
                        cidrBlock: "0.0.0.0/0",
                        natGatewayId: natGw.id,
                    }],
                    tags: {
                        Name: pulumi.interpolate`aptos-${workspaceName}/private`,
                    },
                }, { parent: this.vpc });

                for (const range = { value: 0 }; range.value < awsAvailabilityZones.zoneIds.length; range.value++) {
                    this.rtAssociationsForPrivate.push(new aws.ec2.RouteTableAssociation(`private-${range.value}`, {
                        subnetId: this.subnetsForPrivate.map(__item => __item.id)[range.value],
                        routeTableId: routeTableForPrivate.id,
                    }, { parent: this.subnetsForPrivate[range.value] }));
                }
            });


            this.securityGroupForCluster = new aws.ec2.SecurityGroup("cluster", {
                name: pulumi.interpolate`aptos-${workspaceName}/cluster`,
                description: "k8s masters",
                vpcId: this.vpc.id,
                tags: {
                    Name: pulumi.interpolate`aptos-${workspaceName}/cluster`,
                },
            }, { parent: this.vpc });

            new aws.ec2.Tag(`k8s.io/cluster/aptos-${workspaceName}-cluster`, {
                resourceId: this.securityGroupForCluster.id,
                key: k8sioClusterTagKey,
                value: "owned",
            }, { parent: this.securityGroupForCluster });

            this.securityGroupForNodes = new aws.ec2.SecurityGroup("nodes", {
                name: pulumi.interpolate`aptos-${workspaceName}/nodes`,
                description: "k8s nodes",
                vpcId: this.vpc.id,
                tags: {
                    Name: pulumi.interpolate`aptos-${workspaceName}/nodes`,
                },
            }, { parent: this.vpc });

            new aws.ec2.Tag(`k8s.io/cluster/aptos-${workspaceName}-nodes`, {
                resourceId: this.securityGroupForNodes.id,
                key: k8sioClusterTagKey,
                value: "owned",
            }, { parent: this.securityGroupForNodes });

            const sgRuleClusterApi = new aws.ec2.SecurityGroupRule("cluster-api", {
                securityGroupId: this.securityGroupForCluster.id,
                type: "ingress",
                protocol: "tcp",
                fromPort: 443,
                toPort: 443,
                sourceSecurityGroupId: this.securityGroupForNodes.id,
                description: "Allow API traffic from k8s nodes",
            }, { parent: this.securityGroupForCluster });

            const sgRuleClusterKubelet = new aws.ec2.SecurityGroupRule("cluster-kubelet", {
                securityGroupId: this.securityGroupForCluster.id,
                type: "egress",
                protocol: "tcp",
                fromPort: 10250,
                toPort: 10250,
                sourceSecurityGroupId: this.securityGroupForNodes.id,
                description: "Allow kubelet traffic to k8s nodes",
            }, { parent: this.securityGroupForCluster });

            const sgRuleNodesTcp = new aws.ec2.SecurityGroupRule("nodes-tcp", {
                securityGroupId: this.securityGroupForNodes.id,
                type: "ingress",
                protocol: "tcp",
                fromPort: 1025,
                toPort: 65535,
                sourceSecurityGroupId: this.securityGroupForNodes.id,
                description: "Allow TCP traffic between k8s nodes",
            }, { parent: this.securityGroupForNodes });

            const sgRuleNodesUdp = new aws.ec2.SecurityGroupRule("nodes-udp", {
                securityGroupId: this.securityGroupForNodes.id,
                type: "ingress",
                protocol: "udp",
                fromPort: 1025,
                toPort: 65535,
                sourceSecurityGroupId: this.securityGroupForNodes.id,
                description: "Allow UDP traffic between k8s nodes",
            }, { parent: this.securityGroupForNodes });

            const sgRuleNodesIcmp = new aws.ec2.SecurityGroupRule("nodes-icmp", {
                securityGroupId: this.securityGroupForNodes.id,
                type: "ingress",
                protocol: "icmp",
                fromPort: -1,
                toPort: -1,
                sourceSecurityGroupId: this.securityGroupForNodes.id,
                description: "Allow ICMP traffic between k8s nodes",
            }, { parent: this.securityGroupForNodes });

            const sgRuleNodesDns = new aws.ec2.SecurityGroupRule("nodes-dns", {
                securityGroupId: this.securityGroupForNodes.id,
                type: "ingress",
                protocol: "udp",
                fromPort: 53,
                toPort: 53,
                sourceSecurityGroupId: this.securityGroupForNodes.id,
                description: "Allow DNS traffic between k8s nodes",
            }, { parent: this.securityGroupForNodes });

            const sgRuleNodesKubelet = new aws.ec2.SecurityGroupRule("nodes-kubelet", {
                securityGroupId: this.securityGroupForNodes.id,
                type: "ingress",
                protocol: "tcp",
                fromPort: 10250,
                toPort: 10250,
                sourceSecurityGroupId: this.securityGroupForCluster.id,
                description: "Allow kubelet traffic from k8s masters",
            }, { parent: this.securityGroupForNodes });

            const sgRuleNodesEgress = new aws.ec2.SecurityGroupRule("nodes-egress", {
                securityGroupId: this.securityGroupForNodes.id,
                type: "egress",
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
                description: "Allow all outgoing traffic",
            }, { parent: this.securityGroupForNodes });

            this.eksCluster = new aws.eks.Cluster("aptos", {
                name: args.eksClusterName,
                roleArn: this.iamRoleForCluster.arn,
                version: args.kubernetesVersion,
                enabledClusterLogTypes: [
                    "api",
                    "audit",
                    "authenticator",
                    "controllerManager",
                    "scheduler",
                ],
                vpcConfig: {
                    subnetIds: pulumi.all([this.subnetsForPrivate, this.subnetsForPublic]).apply(
                        ([privates, publics]) => {
                            return [
                                ...privates.map(subnet => subnet.id),
                                ...publics.map(subnet => subnet.id),
                            ];
                        }),
                    publicAccessCidrs: args.k8sApiSources,
                    endpointPrivateAccess: true,
                    securityGroupIds: [this.securityGroupForCluster.id],
                },
            }, { parent: this.vpc });

            // this.cwLogGroupForEks = new aws.cloudwatch.LogGroup("eks", {
            //     name: pulumi.interpolate`/aws/eks/aptos-${workspaceName}/cluster`,
            //     retentionInDays: 7,
            // }, { parent: this.eksCluster });

            const k8sProvider = getK8sProviderFromEksCluster({
                eksCluster: this.eksCluster,
                region: "us-west-2",
                accountId: accountId,
            }, { parent: this.eksCluster });

            const eksClusterAuthOutput = aws.eks.getClusterAuthOutput({
                name: this.eksCluster.name,
            }, { parent: this.eksCluster });

            const nodeGroupPools = {
                utilities: {
                    instanceType: args.utilityInstanceType,
                    size: 1,
                    taint: false,
                },
                fullnode: {
                    instanceType: args.fullnodeInstanceType,
                    size: pulumi.all([args.numFullnodes, args.numExtraInstance]).apply(([numFullnodes, numExtraInstance]) => (numFullnodes || 0) + (numExtraInstance || 0)),
                    taint: false,
                },
            };

            for (const range of Object.entries(nodeGroupPools).map(([k, v]) => ({ key: k, value: v }))) {
                this.launchTemplateForNodes.push(new aws.ec2.LaunchTemplate(`nodes-${range.key}`, {
                    name: pulumi.interpolate`aptos-${workspaceName}/${range.key}`,
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
                        tags: {
                            Name: pulumi.interpolate`aptos-${workspaceName}/${range.key}`,
                        },
                    }],
                }, { parent: this.eksCluster }));
            }

            for (const [index, range] of Object.entries(nodeGroupPools).map(([k, v]) => ({ key: k, value: v })).entries()) {
                this.nodeGroupForNodes.push(new aws.eks.NodeGroup(`nodes-${range.key}`, {
                    clusterName: this.eksCluster.name,
                    nodeGroupName: range.key,
                    version: this.eksCluster.version,
                    nodeRoleArn: this.iamRoleForNodes.arn,
                    subnetIds: [this.subnetsForPrivate[0].id],
                    // tags: defaultTags,
                    launchTemplate: {
                        id: this.launchTemplateForNodes[index].id,
                        version: pulumi.interpolate`${this.launchTemplateForNodes[index].latestVersion}`,
                    },
                    scalingConfig: {
                        // TODO: make this configurable
                        // desiredSize: args.nodePoolSizes.get(range.key) ? args.nodePoolSizes.get(range.key) : 1,
                        desiredSize: 1,
                        minSize: 1,
                        maxSize: 1,
                        // maxSize: args.nodePoolSizes.get(range.key) ? args.nodePoolSizes.get(range.key) * 2 : 1 * 2,
                    },
                    updateConfig: {
                        maxUnavailablePercentage: 50,
                    },
                }, { parent: this.eksCluster }));
            }

            const providerForOIDC = new aws.iam.OpenIdConnectProvider("cluster", {
                clientIdLists: ["sts.amazonaws.com"],
                thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
                url: this.eksCluster.identities.apply(identities => identities[0].oidcs?.[0]?.issuer),
            }, { parent: this.eksCluster });

            const oidcProvider = pulumi.all([providerForOIDC.url]).apply(([url]) => url.replace("https://", ""));
            const iamDocForEbsCsiDriverTrust = aws.iam.getPolicyDocumentOutput({
                statements: [{
                    actions: ["sts:AssumeRoleWithWebIdentity"],
                    principals: [{
                        type: "Federated",
                        identifiers: [currentAwsCallerIdentity.apply(current => pulumi.interpolate`arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
                    }],
                    conditions: [
                        {
                            test: "StringEquals",
                            variable: pulumi.interpolate`${oidcProvider}:sub`,
                            values: ["system:serviceaccount:kube-system:ebs-csi-controller-sa"],
                        },
                        {
                            test: "StringEquals",
                            variable: pulumi.interpolate`${oidcProvider}:aud`,
                            values: ["sts.amazonaws.com"],
                        },
                    ],
                }],
            }, {
                parent: this,
                provider: args.awsProvider,
            });

            this.iamRoleForEbsCsiDriver = new aws.iam.Role("aws-ebs-csi-driver", {
                name: pulumi.interpolate`aptos-${workspaceName}-ebs-csi-controller`,
                path: args.iamPath,
                permissionsBoundary: args.permissionsBoundaryPolicy,
                assumeRolePolicy: iamDocForEbsCsiDriverTrust.apply(aws_ebs_csi_driver_trust_policy => aws_ebs_csi_driver_trust_policy.json),
            }, { parent: this });

            this.iamRoleAttachEbsCsiDriver = new aws.iam.RolePolicyAttachment("caws-ebs-csi-driver", {
                role: this.iamRoleForEbsCsiDriver.name,
                policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
            }, { parent: this });

            this.eksAddonEbsCsiDriver = new aws.eks.Addon("aws-ebs-csi-driver", {
                clusterName: this.eksCluster.name,
                addonName: "aws-ebs-csi-driver",
                serviceAccountRoleArn: this.iamRoleForEbsCsiDriver.arn,
            }, { parent: this });

            const iamDocForClusterAutoscalerAssumption = aws.iam.getPolicyDocumentOutput({
                statements: [{
                    actions: ["sts:AssumeRoleWithWebIdentity"],
                    principals: [{
                        type: "Federated",
                        identifiers: [currentAwsCallerIdentity.apply(current => pulumi.interpolate`arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
                    }],
                    conditions: [
                        {
                            test: "StringEquals",
                            variable: pulumi.interpolate`${oidcProvider}:sub`,
                            values: ["system:serviceaccount:kube-system:cluster-autoscaler"],
                        },
                        {
                            test: "StringEquals",
                            variable: pulumi.interpolate`${oidcProvider}:aud`,
                            values: ["sts.amazonaws.com"],
                        },
                    ],
                }],
            }, {
                parent: this,
                provider: args.awsProvider,
            });

            const iamDocForClusterAutoscalerPermissions = aws.iam.getPolicyDocumentOutput({
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
                            variable: pulumi.interpolate`aws:ResourceTag/k8s.io/cluster-autoscaler/${this.eksCluster.name}`,
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
            }, {
                parent: this,
                provider: args.awsProvider,
            });

            this.iamRoleForClusterAutoscaler = new aws.iam.Role("cluster-autoscaler", {
                name: pulumi.interpolate`aptos-fullnode-${workspaceName}-cluster-autoscaler`,
                path: args.iamPath,
                permissionsBoundary: args.permissionsBoundaryPolicy,
                assumeRolePolicy: iamDocForClusterAutoscalerAssumption.apply(cluster_autoscaler_assume_role => cluster_autoscaler_assume_role.json),
            }, { parent: this });

            this.iamRolePolicyClusterAutoscaler = new aws.iam.RolePolicy("cluster-autoscaler", {
                name: "Helm",
                role: this.iamRoleForClusterAutoscaler.name,
                policy: iamDocForClusterAutoscalerPermissions.apply(cluster_autoscaler => cluster_autoscaler.json),
            }, { parent: this });

            const autoscalingHelmChartPath = `${defaults.getRelativePathToHelmDir(__dirname)}/autoscaling`;
            // const helmReleaseForAutoscaling = new k8s.helm.v3.Release("autoscaling", {
            //     name: "autoscaling",
            //     namespace: "kube-system",
            //     chart: autoscalingHelmChartPath,
            //     maxHistory: 5,
            //     waitForJobs: false,
            //     values: {
            //         autoscaler: {
            //             enabled: true,
            //             clusterName: this.eksCluster.name,
            //             image: {
            //                 tag: `v${this.eksCluster.version}.0`,
            //             },
            //             serviceAccount: {
            //                 annotations: {
            //                     "eks.amazonaws.com/role-arn": this.iamRoleForClusterAutoscaler.arn,
            //                 },
            //             },
            //         },
            //         chart_sha1: args.manageViaPulumi ? computeSha1ForHelmRelease(
            //             std.abspath({
            //                 input: autoscalingHelmChartPath,
            //             }),
            //         ).digest('hex') : "",
            //     },
            // }, {
            //     provider: k8sProvider,
            //     parent: k8sProvider,
            // });

            const k8sNamespaceForTigera = new k8s.core.v1.Namespace("tigera-operator", {
                metadata: {
                    annotations: {
                        name: "tigera-operator",
                    },
                    name: "tigera-operator",
                }
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            });

            const helmReleaseForCalico = new k8s.helm.v3.Release("calico", {
                name: "calico",
                repositoryOpts: {
                    repo: "https://docs.projectcalico.org/charts",
                },
                chart: "tigera-operator",
                version: "3.23.3",
                namespace: "tigera-operator",
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            });

            let mapRolesList = []
            let mapUsersList = []

            for (const role of (args.k8sAdminRoles || [])) {
                mapRolesList.push({
                    rolearn: pulumi.interpolate`arn:aws:iam::${accountId}:role/${role}`,
                    username: pulumi.interpolate`${role}:{{SessionName}}`,
                    groups: `["system:masters"]`,
                })
            }

            for (const role of args.k8sViewerRoles || []) {
                mapRolesList.push({
                    rolearn: pulumi.interpolate`arn:aws:iam::${accountId}:role/${role}`,
                    username: pulumi.interpolate`${role}:{{SessionName}}`,
                    groups: `["viewers"]`,
                })
            }

            for (const role of args.k8sDebuggerRoles || []) {
                mapRolesList.push({
                    rolearn: pulumi.interpolate`arn:aws:iam::${accountId}:role/${role}`,
                    username: pulumi.interpolate`${role}:{{SessionName}}`,
                    groups: `["debuggers"]`,
                })
            }

            for (const user of args.k8sAdmins || []) {
                mapUsersList.push({
                    userarn: pulumi.interpolate`arn:aws:iam::${accountId}:user/${user}`,
                    username: user,
                    groups: `["system:masters"]`,
                })
            }

            for (const user of args.k8sViewers || []) {
                mapUsersList.push({
                    userarn: pulumi.interpolate`arn:aws:iam::${accountId}:user/${user}`,
                    username: user,
                    groups: `["viewers"]`,
                })
            }

            for (const user of args.k8sDebuggers || []) {
                mapUsersList.push({
                    userarn: pulumi.interpolate`arn:aws:iam::${accountId}:user/${user}`,
                    username: user,
                    groups: `["debuggers"]`,
                })
            }

            this.awsAuthConfigMap = new k8s.core.v1.ConfigMap(`aws-auth`, {
                metadata: {
                    name: "aws-auth",
                    namespace: "kube-system",
                },
                data: {
                    mapUsers: yaml.stringify(mapUsersList),
                    mapRoles: yaml.stringify(mapRolesList),
                },
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            });

            pulumi.all([this.eksCluster]).apply(() => {

            })

            const deleteGp2 = new local.Command("delete-gp2", {
                environment: {
                    REGION: args.region,
                    CLUSTER_NAME: args.eksClusterName,
                    // TODO: kubeconfig needs to be a file...
                    // don't think we need kubeconfig. just use aws eks command
                    // KUBECONFIG: getKubeconfigFromEksCluster({
                    //     accountId: accountId,
                    //     eksCluster: this.eksCluster,
                    //     region: args.region,
                    // }).apply(kubeconfig => kubeconfig.exportConfig()),
                },
                create: pulumi.all([this.eksCluster]).apply(([cluster]) => {
                    return pulumi.interpolate`aws --region ${args.region} eks get-token --cluster-name ${cluster.name} && sleep 1 && kubectl delete --ignore - not - found storageclass gp2 && sleep 5`
                }),
            }, { parent: this });

            this.k8sStorageClassForIo1 = new k8s.storage.v1.StorageClass("io1", {
                metadata: {
                    name: "io1",
                },
                provisioner: "kubernetes.io/aws-ebs",
                volumeBindingMode: "WaitForFirstConsumer",
                parameters: {
                    type: "io1",
                    iopsPerGB: "50",
                },
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            })

            this.k8sStorageClassForGp3 = new k8s.storage.v1.StorageClass("gp3", {
                metadata: {
                    name: "gp3",
                    annotations: {
                        "storageclass.kubernetes.io/is-default-class": "false",
                    },
                },
                provisioner: "ebs.csi.aws.com",
                volumeBindingMode: "WaitForFirstConsumer",
                parameters: {
                    type: "gp3",
                },
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            })

            this.k8sStorageClassForIo2 = new k8s.storage.v1.StorageClass("io2", {
                metadata: {
                    name: "io2",
                },
                provisioner: "ebs.csi.aws.com",
                volumeBindingMode: "WaitForFirstConsumer",
                parameters: {
                    type: "io2",
                    iops: "40000",
                },
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            })

            this.k8sStorageClassForGp2 = new k8s.storage.v1.StorageClass("gp2", {
                metadata: {
                    name: "gp2",
                    annotations: {
                        "storageclass.kubernetes.io/is-default-class": "true",
                    },
                },
                provisioner: "kubernetes.io/aws-ebs",
                volumeBindingMode: "WaitForFirstConsumer",
                parameters: {
                    type: "gp2",
                },
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            })

            this.k8sRoleForDebug = new k8s.rbac.v1.ClusterRole("debug", {
                metadata: {
                    name: "debug",
                },
                rules: [
                    {
                        apiGroups: ["*"],
                        resources: ["pods/portforward", "pods/exec"],
                        verbs: ["create"],
                    },
                ],
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            });

            this.k8sRoleBindingForDebuggers = new k8s.rbac.v1.RoleBinding("debuggers", {
                metadata: {
                    name: "debuggers",
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: this.k8sRoleForDebug.metadata.name,
                },
                subjects: [
                    {
                        kind: "Group",
                        name: "debuggers",
                    },
                ],
            }, {
                provider: k8sProvider,
                parent: k8sProvider,
            });

            this.k8sRoleBindingForViewers = new k8s.rbac.v1.RoleBinding("viewers", {
                metadata: {
                    name: "viewers",
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: "view",
                },
                subjects: [
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
                provider: k8sProvider,
                parent: k8sProvider,
            });

            // TODO: write kubeconfig to file named `${workspaceName}-kubernetes.json`
        });
    }
}

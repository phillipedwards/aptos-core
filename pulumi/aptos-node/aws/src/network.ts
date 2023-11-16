import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface NetworkConfig {
    vpcCidrBlock: string;
    azs: pulumi.Input<string>[];
    maximizeSingleAzCapacity: pulumi.Input<boolean>;
}

export interface NetworkArgs extends NetworkConfig {
    workspaceName: pulumi.Input<string>;
}

export class Network extends pulumi.ComponentResource {
    public readonly vpc: aws.ec2.Vpc;
    public readonly publicSubnets: aws.ec2.Subnet[];
    public readonly privateSubnets: aws.ec2.Subnet[];
    public readonly internetGateway: aws.ec2.InternetGateway;
    public readonly publicRouteTable: aws.ec2.RouteTable;
    public readonly privateRouteTable: aws.ec2.RouteTable;
    public readonly natEip: aws.ec2.Eip | undefined;
    public readonly natGateway: aws.ec2.NatGateway | undefined;
    public readonly clusterSecurityGroup: aws.ec2.SecurityGroup;
    public readonly nodesSecurityGroup: aws.ec2.SecurityGroup;
    public readonly nodesEgressSecurityGroupRule: aws.ec2.SecurityGroupRule;

    constructor(name: string, config: NetworkArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Network", name, {}, opts);

        const cidr = "192.168.0.0/16"
        const publicSubnetCidrRanges = [
            "192.168.0.0/19" as pulumi.Input<string>,
            "192.168.32.0/19" as pulumi.Input<string>,
            "192.168.64.0/19" as pulumi.Input<string>,
        ]
        const privateSubnetCidrRanges = [
            "192.168.128.0/19" as pulumi.Input<string>,
            "192.168.160.0/19" as pulumi.Input<string>,
            "192.168.192.0/19" as pulumi.Input<string>,
        ]

        const numAzs = Number(config.azs.length);
        const numOtherSubnets = numAzs * 2 - 1;
        // const maxSubnetCidrRanges = getSubnets(config.vpcCidrBlock, 1, [
        //     ...Array.from({ length: numOtherSubnets }, (_, i) => 1 + Math.ceil(Math.pow(numOtherSubnets, 0.5))),
        // ]);

        // const maxPrivateSubnetCidrRanges = maxSubnetCidrRanges.slice(0, numAzs).map(subnet => subnet.cidr);
        // const maxPublicSubnetCidrRanges = maxSubnetCidrRanges.slice(numAzs, numAzs * 2).map(subnet => subnet.cidr);

        // const defaultPublicSubnetCidrRanges = Array.from({ length: numAzs }, (_, i) =>
        //     getNextSubnet(getNextSubnet(config.vpcCidrBlock, 1, 0), 2, i)
        // );
        // const defaultPrivateSubnetCidrRanges = Array.from({ length: numAzs }, (_, i) =>
        //     getNextSubnet(getNextSubnet(config.vpcCidrBlock, 1, 1), 2, i)
        // );

        // const publicSubnetCidrRanges = config.maximizeSingleAzCapacity
        //     ? maxPublicSubnetCidrRanges
        //     : defaultPublicSubnetCidrRanges;
        // const privateSubnetCidrRanges = config.maximizeSingleAzCapacity
        //     ? maxPrivateSubnetCidrRanges
        //     : defaultPrivateSubnetCidrRanges;

        const aptosK8sTagKey = `kubernetes.io/cluster/aptos-${config.workspaceName}`

        this.vpc = new aws.ec2.Vpc(`vpc`, {
            cidrBlock: config.vpcCidrBlock,
            enableDnsHostnames: true,
            tags: {
                "Name": `aptos-${config.workspaceName}`,
                [aptosK8sTagKey]: "shared",
            },
        }, { parent: this });

        this.publicSubnets = [];
        this.privateSubnets = [];

        for (let i = 0; i < numAzs; i++) {
            const thisAZ = config.azs[i];
            const publicSubnet = new aws.ec2.Subnet(`public-${i}`, {
                vpcId: this.vpc.id,
                cidrBlock: publicSubnetCidrRanges[i],
                availabilityZone: thisAZ,
                mapPublicIpOnLaunch: true,
                tags: {
                    "Name": `aptos-${config.workspaceName}/public-${thisAZ}`,
                    [aptosK8sTagKey]: "shared",
                    "kubernetes.io/role/elb": "1",
                },
            }, { parent: this.vpc });

            const privateSubnet = new aws.ec2.Subnet(`private-${i}`, {
                vpcId: this.vpc.id,
                cidrBlock: privateSubnetCidrRanges[i],
                availabilityZone: thisAZ,
                tags: {
                    'Name': `aptos-${config.workspaceName}/private-${thisAZ}`,
                    [aptosK8sTagKey]: "shared",
                    "kubernetes.io/role/internal-elb": '1',
                },
            }, { parent: this.vpc });

            this.publicSubnets.push(publicSubnet);
            this.privateSubnets.push(privateSubnet);
        }

        this.internetGateway = new aws.ec2.InternetGateway(`public`, {
            vpcId: this.vpc.id,
            tags: {
                "Name": `aptos-${config.workspaceName}`,
            }
        }, { parent: this.vpc });

        this.publicRouteTable = new aws.ec2.RouteTable(`public`, {
            vpcId: this.vpc.id,
            routes: [{
                cidrBlock: "0.0.0.0/0",
                gatewayId: this.internetGateway.id,
            }],
            tags: {
                "Name": `aptos-${config.workspaceName}/public`,
            },
        }, { parent: this.vpc });

        this.natEip = new aws.ec2.Eip(`nat`, {
            tags: {
                "Name": `aptos-${config.workspaceName}-nat`,
            },
        }, { parent: this });

        this.natGateway = new aws.ec2.NatGateway(`private`, {
            allocationId: this.natEip.id,
            subnetId: this.publicSubnets[0].id,
        }, {
            dependsOn: [
                ...this.publicSubnets,
            ],
            parent: this.publicSubnets[0]
        });

        this.privateRouteTable = new aws.ec2.RouteTable(`private`, {
            vpcId: this.vpc.id,
        }, { parent: this.vpc });

        if (numAzs > 0) {

            for (let i = 0; i < numAzs; i++) {
                new aws.ec2.RouteTableAssociation(`public-${i}`, {
                    subnetId: this.publicSubnets[i].id,
                    routeTableId: this.publicRouteTable.id,
                }, { parent: this.publicSubnets[i] });

                new aws.ec2.RouteTableAssociation(`private-${i}`, {
                    subnetId: this.privateSubnets[i].id,
                    routeTableId: this.privateRouteTable.id,
                }, { parent: this.privateSubnets[i] });
            }

            new aws.ec2.Route(`private`, {
                routeTableId: this.privateRouteTable.id,
                destinationCidrBlock: "0.0.0.0/0",
                natGatewayId: this.natGateway.id,
            }, { parent: this.privateRouteTable });
        }

        this.clusterSecurityGroup = new aws.ec2.SecurityGroup(`cluster`, {
            vpcId: this.vpc.id,
            name: pulumi.interpolate`aptos-${config.workspaceName}/cluster`,
            description: "k8s masters",
            tags: {
                "kubernetes.io/cluster/aptos-${config.workspaceName}": "owned",
            },
        }, { parent: this.vpc });

        new aws.ec2.SecurityGroupRule(`cluster-api`, {
            securityGroupId: this.clusterSecurityGroup.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["0.0.0.0/0"],
        }, { parent: this.clusterSecurityGroup });

        new aws.ec2.SecurityGroupRule(`cluster-kubelet`, {
            securityGroupId: this.clusterSecurityGroup.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 10250,
            toPort: 10250,
            cidrBlocks: ["0.0.0.0/0"],
        }, { parent: this.clusterSecurityGroup });

        this.nodesSecurityGroup = new aws.ec2.SecurityGroup(`nodes`, {
            vpcId: this.vpc.id,
            name: pulumi.interpolate`aptos-${config.workspaceName}/nodes`,
            description: "k8s nodes",
            tags: {
                "kubernetes.io/cluster/aptos-${config.workspaceName}": "owned",
            },
        }, { parent: this.vpc });

        new aws.ec2.SecurityGroupRule(`nodes-tcp`, {
            securityGroupId: this.nodesSecurityGroup.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 0,
            toPort: 65535,
            sourceSecurityGroupId: this.clusterSecurityGroup.id,
        }, { parent: this.nodesSecurityGroup });

        new aws.ec2.SecurityGroupRule(`nodes-udp`, {
            securityGroupId: this.nodesSecurityGroup.id,
            type: "ingress",
            protocol: "udp",
            fromPort: 0,
            toPort: 65535,
            sourceSecurityGroupId: this.clusterSecurityGroup.id,
        }, { parent: this.nodesSecurityGroup });

        new aws.ec2.SecurityGroupRule(`nodes-icmp`, {
            securityGroupId: this.nodesSecurityGroup.id,
            type: "ingress",
            protocol: "icmp",
            fromPort: -1,
            toPort: -1,
            sourceSecurityGroupId: this.clusterSecurityGroup.id,
        }, { parent: this.nodesSecurityGroup });

        new aws.ec2.SecurityGroupRule(`nodes-dns`, {
            securityGroupId: this.nodesSecurityGroup.id,
            type: "ingress",
            protocol: "udp",
            fromPort: 53,
            toPort: 53,
            cidrBlocks: ["0.0.0.0/0"],
        }, { parent: this.nodesSecurityGroup });

        new aws.ec2.SecurityGroupRule(`nodes-kubelet`, {
            securityGroupId: this.nodesSecurityGroup.id,
            type: "ingress",
            protocol: "tcp",
            fromPort: 10250,
            toPort: 10250,
            sourceSecurityGroupId: this.clusterSecurityGroup.id,
        }, { parent: this.nodesSecurityGroup });

        this.nodesEgressSecurityGroupRule = new aws.ec2.SecurityGroupRule(`nodes-egress`, {
            securityGroupId: this.nodesSecurityGroup.id,
            type: "egress",
            protocol: "tcp",
            fromPort: 0,
            toPort: 65535,
            cidrBlocks: ["0.0.0.0/0"],
        }, { parent: this.nodesSecurityGroup });

        this.registerOutputs({
            vpcId: this.vpc.id,
            publicSubnetIds: this.publicSubnets.map(subnet => subnet.id),
            privateSubnetIds: this.privateSubnets.map(subnet => subnet.id),
            clusterSecurityGroupId: this.clusterSecurityGroup.id,
            nodesSecurityGroupId: this.nodesSecurityGroup.id,
        });
    }
}

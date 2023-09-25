import * as pulumi from "@pulumi/pulumi";
import * as awsNative from "@pulumi/aws-native";
import * as aws from "@pulumi/aws";
import { SubnetInfo, ip4, ip6, toLongForm, toShortForm, toByteArray, fromByteArray } from 'ip6';

export interface SubnetInfo {
    firstAddress: string;
    lastAddress: string;
    subnetMaskLength: number;
    cidr: string;
}

// Function to calculate next available subnet
export const getNextSubnet = (cidr: string, newBits: number, nth: number): string => {
    const [ip, bits] = cidr.split('/');
    const ipBytes = toByteArray(ip);
    const newBitsValue = nth << (32 - (Number(bits) + newBits));
    const newIpBytes = new Uint8Array(4);

    for (let i = 0; i < 4; i++) {
        newIpBytes[i] = ipBytes[i] | ((newBitsValue >> ((3 - i) * 8)) & 0xFF);
    }

    const newIp = fromByteArray(newIpBytes);
    return `${newIp}/${Number(bits) + newBits}`;
};

// Function to calculate multiple subnets
export function getSubnets(cidr: string, numSubnets: number, subnetSizes: number[]): SubnetInfo[] {
    const isIPv6 = cidr.includes(':');
    const ip = isIPv6 ? ip6 : ip4;
    const subnets: SubnetInfo[] = [];

    let nextSubnet = ip.cidrSubnet(cidr);

    for (let i = 0; i < numSubnets; i++) {
        const subnetSize = subnetSizes[i] || subnetSizes[subnetSizes.length - 1];
        const newSubnet = ip.cidrSubnet(nextSubnet.firstAddress + '/' + subnetSize);
        subnets.push({
            ...newSubnet,
            cidr: `${newSubnet.firstAddress}/${newSubnet.subnetMaskLength}`  // Add this line
        });

        // Update nextSubnet to start where the last one ended
        nextSubnet = ip.cidrSubnet(newSubnet.lastAddress + '/' + nextSubnet.subnetMaskLength);
    }

    return subnets;
}

export interface NetworkConfig {
    vpcCidrBlock: string;
    awsAvailabilityZones: string[];
    maximizeSingleAzCapacity: boolean;
    workspaceName: string;
}

export class Network extends pulumi.ComponentResource {
    public readonly vpc: awsNative.ec2.Vpc;
    public readonly publicSubnets: awsNative.ec2.Subnet[];
    public readonly privateSubnets: awsNative.ec2.Subnet[];
    public readonly internetGateway: awsNative.ec2.InternetGateway;
    public readonly publicRouteTable: awsNative.ec2.RouteTable;
    public readonly privateRouteTable: awsNative.ec2.RouteTable;
    public readonly natEip: awsNative.ec2.Eip;
    public readonly natGateway: awsNative.ec2.NatGateway;
    public readonly clusterSecurityGroup: aws.ec2.SecurityGroup;
    public readonly nodesSecurityGroup: aws.ec2.SecurityGroup;
    public readonly nodesEgressSecurityGroupRule: aws.ec2.SecurityGroupRule;

    constructor(name: string, config: NetworkConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:module:Network", name, {}, opts);

        const numAzs = config.awsAvailabilityZones.length;
        const numOtherSubnets = numAzs * 2 - 1;
        const maxSubnetCidrRanges = getSubnets(config.vpcCidrBlock, 1, [
            ...Array.from({ length: numOtherSubnets }, (_, i) => 1 + Math.ceil(Math.pow(numOtherSubnets, 0.5))),
        ]);

        const maxPrivateSubnetCidrRanges = maxSubnetCidrRanges.slice(0, numAzs).map(subnet => subnet.cidr);
        const maxPublicSubnetCidrRanges = maxSubnetCidrRanges.slice(numAzs, numAzs * 2).map(subnet => subnet.cidr);

        const defaultPublicSubnetCidrRanges = Array.from({ length: numAzs }, (_, i) =>
            getNextSubnet(getNextSubnet(config.vpcCidrBlock, 1, 0), 2, i)
        );
        const defaultPrivateSubnetCidrRanges = Array.from({ length: numAzs }, (_, i) =>
            getNextSubnet(getNextSubnet(config.vpcCidrBlock, 1, 1), 2, i)
        );

        const publicSubnetCidrRanges = config.maximizeSingleAzCapacity
            ? maxPublicSubnetCidrRanges
            : defaultPublicSubnetCidrRanges;
        const privateSubnetCidrRanges = config.maximizeSingleAzCapacity
            ? maxPrivateSubnetCidrRanges
            : defaultPrivateSubnetCidrRanges;

        this.vpc = new awsNative.ec2.Vpc(`vpc`, {
            cidrBlock: config.vpcCidrBlock,
            enableDnsHostnames: true,
            tags: [
                {
                    key: "Name",
                    value: `aptos-${config.workspaceName}`,
                },
                {
                    key: `kubernetes.io/cluster/aptos-${config.workspaceName}`,
                    value: "shared",
                }
            ],
        }, { parent: this });

        this.publicSubnets = [];
        this.privateSubnets = [];

        for (let i = 0; i < numAzs; i++) {
            const publicSubnet = new awsNative.ec2.Subnet(`public-${i}`, {
                vpcId: this.vpc.id,
                cidrBlock: publicSubnetCidrRanges[i],
                availabilityZone: config.awsAvailabilityZones[i],
                tags: [
                    {
                        key: "Name",
                        value: `aptos-${config.workspaceName}/public-${config.awsAvailabilityZones[i]}`,
                    },
                    {
                        key: `kubernetes.io/cluster/aptos-${config.workspaceName}`,
                        value: `shared`,
                    },
                    {
                        key: "kubernetes.io/role/internal-elb",
                        value: `1`,
                    },
                ]
            }, { parent: this.vpc });

            const privateSubnet = new awsNative.ec2.Subnet(`private-${i}`, {
                vpcId: this.vpc.id,
                cidrBlock: privateSubnetCidrRanges[i],
                availabilityZone: config.awsAvailabilityZones[i],
                tags: [
                    {
                        key: "Name",
                        value: `aptos-${config.workspaceName}/public-${config.awsAvailabilityZones[i]}`,
                    },
                    {
                        key: `kubernetes.io/cluster/aptos-${config.workspaceName}`,
                        value: `shared`,
                    },
                    {
                        key: "kubernetes.io/role/internal-elb",
                        value: `1`,
                    },
                ]
            }, { parent: this.vpc });

            this.publicSubnets.push(publicSubnet);
            this.privateSubnets.push(privateSubnet);
        }

        this.internetGateway = new awsNative.ec2.InternetGateway(`public`, {
            tags: [
                {
                    key: "Name",
                    value: `aptos-${config.workspaceName}`,
                },
            ]
        }, { parent: this.vpc });

        this.publicRouteTable = new awsNative.ec2.RouteTable(`public`, {
            vpcId: this.vpc.id,
            tags: [
                {
                    key: "Name",
                    value: `aptos-${config.workspaceName}/public`,
                },
            ]
        }, { parent: this.vpc });

        new awsNative.ec2.Route(`public`, {
            routeTableId: this.publicRouteTable.id,
            destinationCidrBlock: "0.0.0.0/0",
            gatewayId: this.internetGateway.id,
        }, { parent: this.publicRouteTable });

        this.privateRouteTable = new awsNative.ec2.RouteTable(`private`, {
            vpcId: this.vpc.id,
            tags: [
                {
                    key: "Name",
                    value: `aptos-${config.workspaceName}/private`,
                },
            ]
        }, { parent: this.vpc });

        for (let i = 0; i < numAzs; i++) {
            new awsNative.ec2.SubnetRouteTableAssociation(`public-${i}`, {
                subnetId: this.publicSubnets[i].id,
                routeTableId: this.publicRouteTable.id,
            }, { parent: this.publicSubnets[i] });

            new awsNative.ec2.SubnetRouteTableAssociation(`private-${i}`, {
                subnetId: this.privateSubnets[i].id,
                routeTableId: this.privateRouteTable.id,
            }, { parent: this.privateSubnets[i] });
        }

        this.natEip = new awsNative.ec2.Eip(`nat`, {
        }, { parent: this });

        this.natGateway = new awsNative.ec2.NatGateway(`private`, {
            allocationId: this.natEip.id,
            subnetId: this.publicSubnets[0].id,
        }, { parent: this.publicSubnets[0] });

        new awsNative.ec2.Route(`private`, {
            routeTableId: this.privateRouteTable.id,
            destinationCidrBlock: "0.0.0.0/0",
            natGatewayId: this.natGateway.id,
        }, { parent: this.privateRouteTable });

        this.clusterSecurityGroup = new aws.ec2.SecurityGroup(`cluster`, {
            vpcId: this.vpc.id,
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

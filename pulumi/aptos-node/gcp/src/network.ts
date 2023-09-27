import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface NetworkConfig {
    vpcCidrBlock: pulumi.Input<string>;
    publicSubnetCidrBlock: pulumi.Input<string>;
    privateSubnetCidrBlock: pulumi.Input<string>;
}

export class Network extends pulumi.ComponentResource {
    public readonly vpc: gcp.compute.Network;
    public readonly publicSubnet: gcp.compute.Subnetwork;
    public readonly privateSubnet: gcp.compute.Subnetwork;
    public readonly firewall: gcp.compute.Firewall;

    constructor(name: string, config: NetworkConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:network:Network", name, {}, opts);

        // Create a new VPC network
        this.vpc = new gcp.compute.Network(`vpc`, {
            autoCreateSubnetworks: false,
            ipCidrRange: config.vpcCidrBlock,
        }, { parent: this });

        // Create a new public subnet
        this.publicSubnet = new gcp.compute.Subnetwork(`public-subnet`, {
            ipCidrRange: config.publicSubnetCidrBlock,
            network: this.vpc.selfLink,
            region: gcp.config.region,
        }, { parent: this });

        // Create a new private subnet
        this.privateSubnet = new gcp.compute.Subnetwork(`private-subnet`, {
            ipCidrRange: config.privateSubnetCidrBlock,
            network: this.vpc.selfLink,
            region: gcp.config.region,
        }, { parent: this });

        // Create a new firewall rule
        this.firewall = new gcp.compute.Firewall(`firewall`, {
            network: this.vpc.selfLink,
            allows: [{
                protocol: "tcp",
                ports: ["80", "443"],
            }],
            sourceRanges: ["0.0.0.0/0"],
        }, { parent: this });

        // Export the network and subnet information
        this.registerOutputs({
            vpcName: this.vpc.name,
            vpcSelfLink: this.vpc.selfLink,
            publicSubnetName: this.publicSubnet.name,
            publicSubnetSelfLink: this.publicSubnet.selfLink,
            publicSubnetIpCidrRange: this.publicSubnet.ipCidrRange,
            privateSubnetName: this.privateSubnet.name,
            privateSubnetSelfLink: this.privateSubnet.selfLink,
            privateSubnetIpCidrRange: this.privateSubnet.ipCidrRange,
            firewallName: this.firewall.name,
        });
    }
}

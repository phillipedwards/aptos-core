import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface NetworkConfig {
    networkName: pulumi.Input<string>;
    subnetworkNames: pulumi.Input<string>[];
}

export class Network extends pulumi.ComponentResource {
    public readonly network: gcp.compute.Network;
    public readonly subnetworks: gcp.compute.Subnetwork[];
    public readonly natRouter: gcp.compute.Router;
    public readonly natAddress: gcp.compute.Address;
    public readonly natRouterNat: gcp.compute.RouterNat;

    constructor(name: string, config: NetworkConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:network:Network", name, {}, opts);

        // Create a new VPC network
        this.network = new gcp.compute.Network(`network`, {
            name: config.networkName,
        }, { parent: this });

        // Create new subnetworks in the VPC network
        this.subnetworks = config.subnetworkNames.map((subnetworkName, index) => {
            return new gcp.compute.Subnetwork(`subnetwork-${index}`, {
                name: subnetworkName,
                ipCidrRange: `10.0.${index}.0/24`,
                network: this.network.selfLink,
            }, { parent: this });
        });

        // Create a new NAT router
        this.natRouter = new gcp.compute.Router(`nat`, {
            name: "nat-router",
            network: this.network.selfLink,
        }, { parent: this });

        // Create a new NAT address
        this.natAddress = new gcp.compute.Address(`nat-address`, {
            name: "nat-address",
            region: "us-central1",
        }, { parent: this });

        // Create a new NAT router NAT
        this.natRouterNat = new gcp.compute.RouterNat(`nat`, {
            name: "nat",
            router: this.natRouter.name,
            natIpAllocateOption: "AUTO_ONLY",
            sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
        }, { parent: this });

        // Export the network information
        this.registerOutputs({
            networkName: this.network.name,
            subnetworkNames: this.subnetworks.map(subnetwork => subnetwork.name),
            natRouterName: this.natRouter.name,
            natAddressName: this.natAddress.name,
            natRouterNatName: this.natRouterNat.name,
        });
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as command from "@pulumi/command";

export interface NetworkConfig {
    workspace: any;
    networkName: pulumi.Input<string>;
    subnetworkNames: pulumi.Input<string>[];
}

export class Network extends pulumi.ComponentResource {
    public readonly network: gcp.compute.Network;
    // public readonly subnetwork: Promise<gcp.compute.GetSubnetworkResult>;
    public readonly natRouter: gcp.compute.Router;
    public readonly natAddress: gcp.compute.Address;
    public readonly natRouterNat: gcp.compute.RouterNat;

    constructor(name: string, config: NetworkConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:network:Network", name, {}, opts);

        // Create a new VPC network
        this.network = new gcp.compute.Network(`aptos`, {
            name: `aptos-${config.workspace}`,
            autoCreateSubnetworks: true,
        }, { parent: this });

        const sleep = new command.local.Command(`sleep`, {
            create: "sleep 120"
        }, {
            dependsOn: [this.network],
            parent: this
        });

        // this.subnetwork = gcp.compute.getSubnetwork({
        //     name: String(this.network.name),
        // }, {
        //     parent: this
        // })

        // Create a new NAT router
        this.natRouter = new gcp.compute.Router(`nat`, {
            name: `aptos-${config.workspace}-nat`,
            network: this.network.selfLink,
        }, {
            dependsOn: [sleep],
            parent: this
        });

        // Create a new NAT address
        this.natAddress = new gcp.compute.Address(`nat-address`, {
            name: `aptos-${config.workspace}-nat`,
        }, {
            dependsOn: [sleep],
            parent: this
        });

        // Create a new NAT router NAT
        this.natRouterNat = new gcp.compute.RouterNat(`nat`, {
            name: `aptos-${config.workspace}-nat`,
            router: this.natRouter.name,
            natIpAllocateOption: "MANUAL_ONLY",
            sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
        }, {
            dependsOn: [sleep],
            parent: this
        });
    }
}

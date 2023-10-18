import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as command from "@pulumi/command";
import { aliasTransformation } from './transformation';

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
        super("aptos-node:gcp:Network", name, {}, opts);

        // generated code from state file import
        // const aptos = new gcp.compute.Network("aptos", {
        //     name: "aptos-default",
        //     project: "geoff-miller-pulumi-corp-play",
        //     routingMode: "REGIONAL",
        // }, {
        //     protect: true,
        // });

        // Create a new VPC network
        this.network = new gcp.compute.Network(`aptos`, {
            name: pulumi.interpolate`aptos-${config.workspace}`,
            // routingMode: "REGIONAL",
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
            name: pulumi.interpolate`aptos-${config.workspace}-nat`,
            network: this.network.selfLink,
        }, {
            dependsOn: [sleep],
            parent: this
        });

        // Create a new NAT address
        this.natAddress = new gcp.compute.Address(`nat`, {
            name: pulumi.interpolate`aptos-${config.workspace}-nat`,
        }, {
            dependsOn: [sleep],
            parent: this
        });

        // Create a new NAT router NAT
        this.natRouterNat = new gcp.compute.RouterNat(`nat`, {
            name: pulumi.interpolate`aptos-${config.workspace}-nat`,
            router: this.natRouter.name,
            natIpAllocateOption: "MANUAL_ONLY",
            natIps: [this.natAddress.selfLink],
            sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_PRIMARY_IP_RANGES",
        }, {
            dependsOn: [sleep],
            parent: this
        });
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as command from "@pulumi/command";

export interface DnsConfig {
    dnsTtl: pulumi.Input<number>;
    workspace: pulumi.Input<string>;
    createDnsRecords: pulumi.Input<boolean>;
    domainName: pulumi.Input<string>;
    validatorIp: pulumi.Input<string>;
    fullnodeIp: pulumi.Input<string>;
    zoneName: string;
}

export class Dns extends pulumi.ComponentResource {
    public readonly validatorDnsRecordSet: gcp.dns.RecordSet;
    public readonly fullnodeDnsRecordSet: gcp.dns.RecordSet;

    constructor(name: string, config: DnsConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:dns:Dns", name, {}, opts);

        // get the google dns zone
        const zone = gcp.dns.getManagedZone({
            name: config.zoneName,
        }, { parent: this });

        // create a pulumi/command local command resource that calls sleep for 2 minutes
        // this is a hack to wait for the load balancer to be ready for DNS registration
        const sleep = new command.local.Command(`sleep`, {
            create: "sleep 120"
        }, { parent: this });

        if (config.createDnsRecords) {
            // Create a new random string for the validator DNS name
            const validatorDnsName = new random.RandomString(`validator`, {
                length: 16,
                special: false,
                upper: false,
            }, { parent: this }).result;

            // Create a new DNS record set for the validator
            this.validatorDnsRecordSet = new gcp.dns.RecordSet(`validator`, {
                name: `${validatorDnsName}.${config.domainName}`,
                type: "A",
                ttl: config.dnsTtl,
                managedZone: zone.then(zone => zone.name),
                rrdatas: [gcp.compute.getForwardingRule({
                    name: `${config.workspace}-aptos-node-0-validator-lb`,
                }).then(lb => lb.ipAddress)],
            }, { parent: this });

            // Create a new DNS record set for the fullnode
            this.fullnodeDnsRecordSet = new gcp.dns.RecordSet(`fullnode`, {
                name: `TODO`,
                type: "A",
                ttl: 300,
                managedZone: zone.then(zone => zone.name),
                rrdatas: [gcp.compute.getForwardingRule({
                    name: `${config.workspace}-aptos-node-0-fullnode-lb`,
                }).then(lb => lb.ipAddress)],
            }, { parent: this });
        }


    }
}

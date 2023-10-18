import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";

export interface DnsConfig {
    dnsTtl: pulumi.Input<number>;
    workspace: pulumi.Input<string>;
    createDnsRecords: pulumi.Input<boolean>;
    domainName: pulumi.Input<string>;
    validatorIp: pulumi.Input<string>;
    fullnodeIp: pulumi.Input<string>;
    recordName: pulumi.Input<string>;
    zoneName: string;
    k8sProvider: k8s.Provider;
}

export class Dns extends pulumi.ComponentResource {
    public readonly validatorDnsRecordSet: gcp.dns.RecordSet | undefined;
    public readonly fullnodeDnsRecordSet: gcp.dns.RecordSet | undefined;

    constructor(name: string, config: DnsConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:Dns", name, {}, opts);

        // get the google dns zone
        const zone = gcp.dns.getManagedZone({
            name: config.zoneName,
        }, { parent: this });

        // create a pulumi/command local command resource that calls sleep for 2 minutes
        // this is a hack to wait for the load balancer to be ready for DNS registration
        const sleep = new command.local.Command(`sleep`, {
            create: "sleep 120"
        }, {
            parent: this
        });

        const validatorLB = k8s.core.v1.Service.get("validator-lb",
            pulumi.interpolate`${config.workspace}-aptos-node-0-validator-lb`, {
            provider: config.k8sProvider,
            dependsOn: sleep
        });

        const fullnodeLB = k8s.core.v1.Service.get("fullnode-lb",
            pulumi.interpolate`${config.workspace}-aptos-node-0-fullnode-lb`, {
            provider: config.k8sProvider,
            dependsOn: sleep
        });

        // const nodeExporterServiceIp = nodeExporterService.spec.clusterIP;


        // Create a new random string for the validator DNS name
        const validatorDnsName = new random.RandomString(`validator-dns`, {
            length: 16,
            special: true,
            upper: true,
            lower: true,
            numeric: true,
        }, {
            parent: this,
        }).result;

        // Create a new DNS record set for the validator
        this.validatorDnsRecordSet = new gcp.dns.RecordSet(`validator`, {
            name: pulumi.interpolate`${validatorDnsName}.${config.domainName}.`,
            type: "A",
            ttl: config.dnsTtl,
            managedZone: zone.then(zone => zone.name),
            rrdatas: [validatorLB.status.loadBalancer.ingress[0].ip],
        }, { parent: this });

        // Create a new DNS record set for the fullnode
        this.fullnodeDnsRecordSet = new gcp.dns.RecordSet(`fullnode`, {
            name: pulumi.interpolate`${config.recordName}.${config.domainName}.`,
            type: "A",
            ttl: 300,
            managedZone: zone.then(zone => zone.name),
            rrdatas: [fullnodeLB.status.loadBalancer.ingress[0].ip],
        }, { parent: this });
    }
}

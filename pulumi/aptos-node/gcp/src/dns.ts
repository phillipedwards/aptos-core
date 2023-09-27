import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface DnsConfig {
    domainName: pulumi.Input<string>;
    validatorDnsName: pulumi.Input<string>;
    fullNodeDnsName: pulumi.Input<string>;
}

export class Dns extends pulumi.ComponentResource {
    public readonly validatorRecord: aws.route53.Record;
    public readonly fullNodeRecord: aws.route53.Record;

    constructor(name: string, config: DnsConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:dns:Dns", name, {}, opts);

        // Wait for the load balancer to be created
        const lbCreationSleep = new aws.utils.DelayTimer(`lb-creation-sleep`, {
            seconds: 30,
        }, { parent: this });

        // Create a new random string for the validator DNS name
        const validatorDnsName = new aws.random.RandomString(`validator-dns-name`, {
            length: 10,
            special: false,
        }, { parent: this });

        // Create a new Route53 record for the validator
        this.validatorRecord = new aws.route53.Record(`validator-record`, {
            name: validatorDnsName.result.apply(result => `${result}.${config.domainName}`),
            type: "CNAME",
            ttl: 300,
            records: [config.validatorDnsName],
        }, { parent: this });

        // Create a new Route53 record for the full node
        this.fullNodeRecord = new aws.route53.Record(`fullnode-record`, {
            name: config.fullNodeDnsName,
            type: "CNAME",
            ttl: 300,
            records: [config.fullNodeDnsName],
            dependsOn: [lbCreationSleep],
        }, { parent: this });

        // Export the DNS information
        this.registerOutputs({
            validatorDnsName: this.validatorRecord.fqdn,
            fullNodeDnsName: this.fullNodeRecord.fqdn,
        });
    }
}

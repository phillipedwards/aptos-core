import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";
import * as awsNative from "@pulumi/aws-native";

export interface DNSConfig {
    domainName: string;
    hostedZoneId: string;
    lbDnsName: string;
}

export class DNS extends pulumi.ComponentResource {
    public readonly validatorRecord: aws.route53.Record;
    public readonly fullnodeRecord: aws.route53.Record;

    constructor(name: string, args: DNSConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:DNS", name, {}, opts);

        // create a pulumi/command local command resource that calls sleep for 2 minutes
        // this is a hack to wait for the load balancer to be ready for DNS registration
        const sleep = new command.local.Command(`sleep`, {
            create: "sleep 120"
        }, { parent: this });

        const validatorDnsName = new random.RandomString(`validator`, {
            length: 16,
            special: false,
            upper: false,
        }, {
            dependsOn: sleep,
            parent: this
        }).result;

        const validatorRecord = new aws.route53.Record(`validator`, {
            name: `${validatorDnsName}.${args.domainName}`,
            type: "CNAME",
            ttl: 300,
            records: [args.lbDnsName],
            zoneId: args.hostedZoneId,
        }, {
            dependsOn: sleep,
            parent: this
        });

        const fullnodeRecord = new aws.route53.Record(`fullnode`, {
            name: args.domainName,
            type: "CNAME",
            ttl: 300,
            records: [args.lbDnsName],
            zoneId: args.hostedZoneId,
        }, {
            dependsOn: sleep,
            parent: this
        });

        this.validatorRecord = validatorRecord;
        this.fullnodeRecord = fullnodeRecord;

        this.registerOutputs({
            validatorRecord: this.validatorRecord,
            fullnodeRecord: this.fullnodeRecord,
        });
    }
}

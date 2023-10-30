import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";

export interface DNSConfig {
    hostedZoneId: pulumi.Input<string>;
}

export interface DNSArgs extends DNSConfig {
    domainName: pulumi.Input<string>;
    lbDnsName: pulumi.Input<string>;
}

export class DNS extends pulumi.ComponentResource {
    public readonly validatorRecord: aws.route53.Record;
    public readonly fullnodeRecord: aws.route53.Record;
    public readonly domain: pulumi.Input<string> | undefined;

    constructor(name: string, args: DNSArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:DNS", name, {}, opts);

        this.domain = args.domainName;

        // create a pulumi/command local command resource that calls sleep for 2 minutes
        // this is a hack to wait for the load balancer to be ready for DNS registration
        const sleep = new command.local.Command(`sleep`, {
            create: "sleep 120"
        }, { parent: this });

        const validatorDnsName = new random.RandomString(`validator-dns`, {
            length: 16,
            special: true,
            upper: true,
        }, {
            dependsOn: sleep,
            parent: this
        }).result;

        const validatorRecord = new aws.route53.Record(`validator`, {
            name: pulumi.interpolate`${validatorDnsName}.${args.domainName}`,
            type: "CNAME",
            ttl: 3600,
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

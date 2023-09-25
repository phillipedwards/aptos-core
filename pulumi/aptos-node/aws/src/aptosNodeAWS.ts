import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

import {
    era,
    chainId,
    chainName,
    validatorName,
    imageTag,
    recordName,
    helmChart,
    helmValues,
    helmValuesFile,
    k8sApiSources,
    utilityInstanceType,
    utilityInstanceNum,
    validatorInstanceType,
    validatorInstanceNum,
    validatorInstanceEnableTaint,
    enableLogger,
    loggerHelmValues,
    enableMonitoring,
    monitoringHelmValues,
    workspaceName,
    kubernetesVersion,
} from "./config";

import { Auth } from "./auth";
import { Cluster } from "./cluster";
import { DNS } from "./dns";
import { Network } from "./network";
import { Kubernetes } from "./kubernetes";
import { Security } from "./security";

export class AptosNodeAWS extends pulumi.ComponentResource {

    public readonly awsEipNatPublicIp: pulumi.Output<string>;
    public readonly awsEksCluster: pulumi.Output<any>;
    public readonly awsEksClusterAuthToken: pulumi.Output<string>;
    public readonly awsSubnetPrivate: pulumi.Output<any>;
    public readonly awsSubnetPublic: pulumi.Output<any>;
    public readonly awsVpcCidrBlock: pulumi.Output<string>;
    public readonly clusterSecurityGroupId: pulumi.Output<string>;
    public readonly fullnodeEndpoint: pulumi.Output<string> | undefined;
    public readonly helmReleaseName: pulumi.Output<string>;
    public readonly kubeConfig: pulumi.Output<string> | undefined;
    public readonly oidcProvider: pulumi.Output<string>;
    public readonly validatorEndpoint: pulumi.Output<string> | undefined;
    public readonly vpcId: pulumi.Output<string>;


    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:AptosNodeAWS", name, opts);

        const options = {
            parent: this
        };

        const network = new Network("validator", {
        }, options);

        const auth = new Auth("validator", {
            subnetId: network.nodesSubnetId,
            workspaceName: workspaceName,
        }, options);

        const cluster = new Cluster("validator", {
            k8sApiSources: k8sApiSources,
            natIpAddress: network.natIpAddress,
            roleArn: auth.roleArn,
            subnetId: network.nodesSubnetId,
            subnetPrefixes: network.nodesSubnetAddressPrefixes,
            subnetNetworkSecurityGroupName: network.nodesSecurityGroupName,
            utilityInstanceType: utilityInstanceType,
            utilityInstanceNum: utilityInstanceNum,
            validatorInstanceEnableTaint: validatorInstanceEnableTaint,
            validatorInstanceNum: validatorInstanceNum,
            validatorInstanceType: validatorInstanceType,
            workspaceName: workspaceName,
            kubernetesVersion: kubernetesVersion,
        }, options);

        const kubernetes = new Kubernetes("validator", {
            clusterName: cluster.eksCluster.name.apply(value => value || ""),
            namespaceName: workspaceName,
        }, options);

        const security = new Security("validator", {
            vpcId: network.vpc.id,
            ingressRules: [], // Define your ingress rules here
        }, options);

        if (recordName && recordName !== "") {
            const dns = new DNS("validator", {
                zoneId: "your-zone-id", // Replace with your Route53 Zone ID
                recordName: recordName,
                recordType: "A", // Replace with your record type
                recordValue: "your-record-value", // Replace with your record value
            }, options);

            this.validatorEndpoint = dns.dnsRecord.name;
            this.fullnodeEndpoint = dns.dnsRecord.name; // Replace as needed
        }

        this.awsEipNatPublicIp = network.awsEipNatPublicIp;
        this.awsEksCluster = cluster.awsEksCluster;
        this.awsEksClusterAuthToken = auth.awsEksClusterAuthToken;
        this.awsSubnetPrivate = network.awsSubnetPrivate;
        this.awsSubnetPublic = network.awsSubnetPublic;
        this.awsVpcCidrBlock = network.awsVpcCidrBlock;
        this.clusterSecurityGroupId = cluster.clusterSecurityGroupId;
        this.fullnodeEndpoint = dns?.fullnodeEndpoint;
        this.helmReleaseName = kubernetes.helmReleaseName;
        this.kubeConfig = cluster.kubeConfig;
        this.oidcProvider = auth.oidcProvider;
        this.validatorEndpoint = dns?.validatorEndpoint;
        this.vpcId = network.vpcId;
    }
}

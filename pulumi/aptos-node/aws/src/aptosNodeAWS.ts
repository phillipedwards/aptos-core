import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { Auth } from "./auth";
import { Cluster } from "./cluster";
import * as config from "./config";
import { DNS } from "./dns";
import { Kubernetes } from "./kubernetes";
import { Network } from "./network";
// import { Security } from "./security";

/**
 * Represents an AWS component resource for Aptos Node.
 * @class
 * @extends pulumi.ComponentResource
 */
export class AptosNodeAWS extends pulumi.ComponentResource {

    public readonly awsEipNatPublicIp: pulumi.Output<string> | undefined;
    public readonly awsEksCluster: aws.eks.Cluster;
    public readonly awsEksClusterAuthToken: pulumi.Output<string>;
    public readonly awsSubnetPrivate: aws.ec2.Subnet[];
    public readonly awsSubnetPublic: aws.ec2.Subnet[];
    public readonly awsVpcCidrBlock: pulumi.Output<string>;
    public readonly clusterSecurityGroupId: pulumi.Output<string>;
    public readonly fullnodeEndpoint: pulumi.Output<string> | undefined;
    public readonly helmReleaseName: pulumi.Output<string>;
    public readonly kubeConfig: pulumi.Output<string> | undefined;
    // public readonly oidcProvider: pulumi.Output<string>;
    public readonly validatorEndpoint: pulumi.Output<string> | undefined;
    public readonly vpcId: pulumi.Output<string>;


    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:AptosNodeAWS", name, opts);

        const options = {
            parent: this
        };

        const network = new Network("network", {
            azs: config.azs,
            maximizeSingleAzCapacity: config.maximizeSingleAzCapacity,
            vpcCidrBlock: config.vpcCidrBlock,
            workspaceName: config.workspaceName,
        }, options);

        const auth = new Auth("auth", {
            iamPath: config.iamPath,
            permissionsBoundaryPolicy: config.permissionsBoundaryPolicy,
            workspaceName: config.workspaceName,
        }, options);

        const cluster = new Cluster("validator", {
            clusterName: `aptos-${config.workspaceName}`,
            // tags: {},
            clusterRoleArn: auth.clusterRole.arn,
            workspaceName: config.workspaceName,
            nodeRoleArn: auth.nodesRole.arn,
            instanceType: config.utilityInstanceType,
            kubernetesVersion: config.kubernetesVersion,
            privateSubnetIds: network.privateSubnets.map(subnet => subnet.id),
            publicSubnetIds: network.publicSubnets.map(subnet => subnet.id),
            securityGroupIdNodes: network.nodesSecurityGroup.id,
            securityGroupIdCluster: network.clusterSecurityGroup.id,
            k8sApiSources: config.k8sApiSources,
            utilitiesNodePool: {
                instance_type: config.utilityInstanceType,
                instance_enable_taint: config.utilityInstanceEnableTaint,
                instance_max_num: config.utilityInstanceMaxNum,
                instance_min_num: config.utilityInstanceMinNum,
                instance_num: config.utilityInstanceNum,
            },
            validatorsNodePool: {
                instance_type: config.validatorInstanceType,
                instance_enable_taint: config.validatorInstanceEnableTaint,
                instance_max_num: config.validatorInstanceMaxNum,
                instance_min_num: config.validatorInstanceMinNum,
                instance_num: config.validatorInstanceNum,
            },
            // TODO: Tagging
        }, options);

        const kubernetes = new Kubernetes("validator", {
            eksCluster: cluster.eksCluster,
            vpcId: network.vpc.id,
            subnetIds: network.privateSubnets.map(subnet => subnet.id),
            // TODO: Tagging
            // tags: {
            //     "kubernetes.io/cluster/": "true",
            // },
        }, options);

        // const security = new Security("validator", {
        //     vpcId: network.vpc.id,
        //     ingressRules: [], // Define your ingress rules here
        // }, options);

        if (config.recordName && pulumi.interpolate`${config.recordName}` !== pulumi.interpolate``) {
            const dns = new DNS("validator", {
                domainName: config.recordName,
                hostedZoneId: config.zoneId,
                lbDnsName: cluster.eksCluster.endpoint,
            }, options);

            this.validatorEndpoint = dns.validatorRecord.fqdn;
            this.fullnodeEndpoint = dns.fullnodeRecord.fqdn;
        }

        this.awsEipNatPublicIp = network.natEip ? network.natEip.address.apply(address => address || "") : undefined;
        this.awsEksCluster = cluster.eksCluster;
        this.awsEksClusterAuthToken = cluster.eksCluster.certificateAuthorities?.apply(ca => ca[0].data);
        this.awsSubnetPrivate = network.privateSubnets;
        this.awsSubnetPublic = network.publicSubnets;
        this.awsVpcCidrBlock = network.vpc.cidrBlock;
        this.clusterSecurityGroupId = network.clusterSecurityGroup.id;
        this.helmReleaseName = kubernetes.calicoHelmRelease.name;
        // this.kubeConfig = cluster.kubeConfig;
        // this.oidcProvider = auth.oidcProvider;
        this.vpcId = network.vpc.id;
    }
}

import * as aws from '@pulumi/aws';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import { Auth, AuthConfig } from "./auth";
import { Cluster, NodePoolConfig, ClusterConfig } from "./cluster";
import * as config from "./config";
import { DNS, DNSConfig } from "./dns";
import { Kubernetes, KubernetesConfig } from "./kubernetes";
import { Network, NetworkConfig } from "./network";
import {
    getDnsRecordNameFromPatternWithWorkspaceName,
} from "../../../lib/helpers"
// import { Security, SecurityConfig } from "./security";

export interface AptosNodeAWSArgs {
    clusterConfig: ClusterConfig;
    dnsConfig: DNSConfig;
    networkConfig: NetworkConfig;
    authConfig: AuthConfig;
    kubernetesConfig: KubernetesConfig;
    // securityConfig: SecurityConfig;
    workspaceNameOverride?: pulumi.Input<string>;
    recordName?: pulumi.Input<string>;
    helmReleaseNameOverride?: pulumi.Input<string>;
    region: pulumi.Input<string>;
}

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
    // public readonly awsProvider: aws.Provider;
    public readonly k8sProvider: k8s.Provider;
    public readonly openidConnectProvider: aws.iam.OpenIdConnectProvider;


    constructor(name: string, args: AptosNodeAWSArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:AptosNodeAWS", name, opts);

        const workspaceName = (args.workspaceNameOverride !== "" && args.workspaceNameOverride) ? args.workspaceNameOverride : pulumi.getStack();
        const domain = getDnsRecordNameFromPatternWithWorkspaceName(args.recordName, workspaceName)
        // const domain = pulumi.all([workspaceName, args.recordName]).apply(([workspaceName, record]) => {
        //     if (record === undefined || record === "") {
        //         return pulumi.interpolate``;
        //     } else if (record.includes("<workspace>")) {
        //         return record.replace("<workspace>", workspaceName);
        //     } else {
        //         return record;
        //     }
        // });
        const helmReleaseName = (args.helmReleaseNameOverride !== "" && args.helmReleaseNameOverride) ? args.helmReleaseNameOverride : workspaceName;

        const options = {
            parent: this
        };

        const profile = config.profile || process.env.AWS_PROFILE;

        // this.awsProvider = new aws.Provider("aws", {
        //     // TODO: fix region
        //     region: "us-west-2",
        //     accessKey: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : undefined,
        //     secretKey: process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : undefined,
        //     profile: process.env.AWS_PROFILE ? process.env.AWS_PROFILE : undefined,
        //     defaultTags: {
        //         tags: {
        //             "pulumi": "validator",
        //             "pulumi/organziation": pulumi.getOrganization(),
        //             "pulumi/project": pulumi.getProject(),
        //             "pulumi/stack": pulumi.getStack(),
        //             "kubernetes.io/cluster/aptos-default": "owned",
        //         }
        //     }
        // }, { aliases: ["urn:pulumi:sandbox::aws::pulumi:providers:aws::default_5_42_0"] });

        const network = new Network("network", {
            ...args.networkConfig,
            workspaceName: workspaceName,
        }, options);

        const auth = new Auth("auth", {
            ...args.authConfig,
            workspaceName: workspaceName,
        }, options);

        const cluster = new Cluster("validator", {
            ...args.clusterConfig,
            clusterRoleArn: auth.clusterRole.arn,
            nodeRoleArn: auth.nodesRole.arn,
            privateSubnetIds: network.privateSubnets.map(subnet => subnet.id),
            publicSubnetIds: network.publicSubnets.map(subnet => subnet.id),
            securityGroupIdCluster: network.nodesSecurityGroup.id,
            securityGroupIdNodes: network.clusterSecurityGroup.id,
            workspaceName: workspaceName,
        }, options);

        const kubernetes = new Kubernetes("validator", {
            ...args.kubernetesConfig,
            domain: domain,
            helmReleaseName: helmReleaseName,
            nodesIamRoleArn: auth.nodesRole.arn,
            eksCluster: cluster.eksCluster,
            vpcId: network.vpc.id,
            subnetIds: network.privateSubnets.map(subnet => subnet.id),
            region: args.region,
        }, options);

        this.k8sProvider = kubernetes.provider;

        // const security = new Security("validator", {
        //     vpcId: network.vpc.id,
        //     ingressRules: [], // Define your ingress rules here
        // }, options);

        if (domain && pulumi.interpolate`${domain}` !== pulumi.interpolate``) {
            const dns = new DNS("validator", {
                ...args.dnsConfig,
                domainName: getDnsRecordNameFromPatternWithWorkspaceName(config.recordNamePattern, workspaceName),
                lbDnsName: cluster.eksCluster.endpoint,
            }, options);

            this.validatorEndpoint = dns.validatorRecord.fqdn;
            this.fullnodeEndpoint = dns.fullnodeRecord.fqdn;
        }

        this.openidConnectProvider = cluster.openidConnectProvider;
        this.awsEipNatPublicIp = network.natEip ? network.natEip.address.apply(address => address || "") : undefined;
        this.awsEksCluster = cluster.eksCluster;
        this.awsEksClusterAuthToken = cluster.eksCluster.certificateAuthorities?.apply(ca => ca[0].data);
        this.awsSubnetPrivate = network.privateSubnets;
        this.awsSubnetPublic = network.publicSubnets;
        this.awsVpcCidrBlock = network.vpc.cidrBlock;
        this.clusterSecurityGroupId = network.clusterSecurityGroup.id;
        this.helmReleaseName = kubernetes.calicoHelmRelease ? kubernetes.calicoHelmRelease.name : pulumi.interpolate``;
        // this.kubeConfig = cluster.kubeConfig;
        // this.oidcProvider = auth.oidcProvider;
        this.vpcId = network.vpc.id;
        this.k8sProvider = kubernetes.provider;
    }
}

import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

import {
    config,
    workspaceNameOverride,
    workspaceName,
    region,
    // AWS Configurations
    awsConfig,
    numAzs,
    kubernetesVersion,
    k8sApiSources,
    // Aptos Configurations
    numValidators,
    numFullnodeGroups,
    era,
    chainId,
    chainName,
    validatorName,
    imageTag,
    // DNS Configurations
    zoneId,
    workspaceDns,
    recordName,
    createRecords,
    // Helm Configurations
    helmChart,
    helmValues,
    helmValuesFile,
    // Kubernetes User Configurations
    k8sAdmins,
    k8sAdminRoles,
    k8sViewers,
    k8sViewerRoles,
    k8sDebuggers,
    k8sDebuggerRoles,
    // IAM Configurations
    iamPath,
    permissionsBoundaryPolicy,
    // VPC Configurations
    vpcCidrBlock,
    maximizeSingleAzCapacity,
    // Utility Node Configurations
    utilityInstanceType,
    utilityInstanceNum,
    utilityInstanceMinNum,
    utilityInstanceMaxNum,
    utilityInstanceEnableTaint,
    // Validator Node Configurations
    validatorInstanceType,
    validatorInstanceNum,
    validatorInstanceMinNum,
    validatorInstanceMaxNum,
    validatorInstanceEnableTaint,
    // Monitoring and Logging Configurations
    enableCalico,
    enableLogger,
    loggerHelmValues,
    enableMonitoring,
    monitoringHelmValues,
    enablePrometheusNodeExporter,
    enableKubeStateMetrics,
    // Miscellaneous Configurations
    helmReleaseNameOverride,
    validatorStorageClass,
    fullnodeStorageClass,
    manageViaTf,
} from "./config";

import { Auth } from "./auth";
import { Cluster } from "./cluster";
import { DNS } from "./dns";
import { Network } from "./network";
import { Kubernetes } from "./kubernetes";
// import { Security } from "./security";

/**
 * Represents an AWS component resource for Aptos Node.
 * @class
 * @extends pulumi.ComponentResource
 */
export class AptosNodeAWS extends pulumi.ComponentResource {

    public readonly awsEipNatPublicIp: pulumi.Output<string>;
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

        const availableZones = aws.getAvailabilityZones({
            state: "available",
        });

        const network = new Network("network", {
            awsAvailabilityZones: availableZones,
            maximizeSingleAzCapacity: maximizeSingleAzCapacity,
            vpcCidrBlock: vpcCidrBlock,
            workspaceName: workspaceName,
        }, options);

        const auth = new Auth("auth", {
            iamPath: iamPath,
            permissionsBoundaryPolicy: permissionsBoundaryPolicy,
            workspaceName: workspaceName,
        }, options);

        const cluster = new Cluster("validator", {
            clusterName: `aptos-${workspaceName}`,
            clusterRoleArn: auth.clusterRole.arn,
            nodeRoleArn: auth.nodesRole.arn,
            instanceType: utilityInstanceType,
            kubernetesVersion: kubernetesVersion,
            privateSubnetIds: network.privateSubnets.map(subnet => subnet.id),
            publicSubnetIds: network.publicSubnets.map(subnet => subnet.id),
            securityGroupIdNodes: network.nodesSecurityGroup.id,
            securityGroupIdCluster: network.clusterSecurityGroup.id,
            k8sApiSources: k8sApiSources,
            utilitiesNodePool: {
                instance_type: utilityInstanceType,
                instance_enable_taint: String(utilityInstanceEnableTaint),
                instance_max_num: String(utilityInstanceMaxNum),
                instance_min_num: String(utilityInstanceMinNum),
                instance_num: String(utilityInstanceNum),
            },
            validatorsNodePool: {
                instance_type: validatorInstanceType,
                instance_enable_taint: String(validatorInstanceEnableTaint),
                instance_max_num: String(validatorInstanceMaxNum),
                instance_min_num: String(validatorInstanceMinNum),
                instance_num: String(validatorInstanceNum),
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

        if (recordName && recordName !== "") {
            const dns = new DNS("validator", {
                domainName: recordName,
                hostedZoneId: zoneId,
                lbDnsName: cluster.eksCluster.endpoint,
            }, options);

            this.validatorEndpoint = dns.validatorRecord.fqdn;
            this.fullnodeEndpoint = dns.fullnodeRecord.fqdn;
        }

        this.awsEipNatPublicIp = network.natEip.address.apply(address => address || "");
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

import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsconfig from "../../../lib/aws";
import { AptosNodeAWS } from "./aptosNodeAWS";
import * as transformations from './transformation';
import * as config from "./config";
import {
    computeSha1ForHelmRelease,
    aliasTransformation,
    setAWSProviderOnEachAWSResource,
    setK8sProviderOnEachK8sResource,
} from "../../../lib/helpers"

// Register transformations
pulumi.log.info(`Registering aliasTransformation transformation`);
pulumi.runtime.registerStackTransformation(aliasTransformation);
pulumi.log.info(`Registering setAWSProviderOnEachAWSResource transformation`);
pulumi.runtime.registerStackTransformation(setAWSProviderOnEachAWSResource(awsconfig.awsProvider));

const aptosNodeAWS = new AptosNodeAWS("aptos-node-aws", {
    workspaceNameOverride: config.workspaceNameOverride,
    recordName: config.recordNamePattern,
    helmReleaseNameOverride: config.helmReleaseNameOverride,
    region: config.region,
    clusterConfig: {
        k8sApiSources: config.k8sApiSources,
        kubernetesVersion: config.kubernetesVersion,
        utilitiesNodePool: {
            instanceType: config.utilityInstanceType,
            instanceEnableTaint: config.utilityInstanceEnableTaint,
            instanceMaxNum: config.utilityInstanceMaxNum,
            instanceMinNum: config.utilityInstanceMinNum,
            instanceNum: config.utilityInstanceNum,
        },
        validatorsNodePool: {
            instanceType: config.validatorInstanceType,
            instanceEnableTaint: config.validatorInstanceEnableTaint,
            instanceMaxNum: config.validatorInstanceMaxNum,
            instanceMinNum: config.validatorInstanceMinNum,
            instanceNum: config.validatorInstanceNum,
        },
    },
    dnsConfig: {
        hostedZoneId: config.zoneId,
    },
    networkConfig: {
        azs: config.azs,
        maximizeSingleAzCapacity: config.maximizeSingleAzCapacity,
        vpcCidrBlock: config.vpcCidrBlock,
    },
    authConfig: {
        iamPath: config.iamPath,
        permissionsBoundaryPolicy: config.permissionsBoundaryPolicy,
    },
    kubernetesConfig: {
        enableMonitoring: config.enableMonitoring,
        aptosNodeHelmChartPath: config.aptosNodeHelmChartPath,
        chainId: config.chainId,
        chainName: config.chainName,
        era: config.era,
        fullNodeStorageClass: config.fullnodeStorageClass,
        iamPath: config.iamPath,
        imageTag: config.imageTag,
        k8sAdminRoles: config.k8sAdminRoles,
        k8sAdmins: config.k8sAdmins,
        k8sDebuggerRoles: config.k8sDebuggerRoles,
        k8sDebuggers: config.k8sDebuggers,
        k8sViewerRoles: config.k8sViewerRoles,
        k8sViewers: config.k8sViewers,
        loggerHelmChartPath: config.loggerHelmChartPath,
        manageViaPulumi: config.manageViaPulumi,
        monitoringHelmChartPath: config.monitoringHelmChartPath,
        numFullnodeGroups: config.numFullnodeGroups,
        numValidators: config.numValidators,
        validatorName: config.validatorName,
        validatorStorageClass: config.validatorStorageClass,
        enableCalico: config.enableCalico,
        enableKubeStateMetrics: config.enableKubeStateMetrics,
        enableLogger: config.enableLogger,
        enablePrometheusNodeExporter: config.enablePrometheusNodeExporter,
        enableValidator: config.enableValidator,
        tags: {},
    },
});

export const oidcProvider = aptosNodeAWS.oidcProvider;

// Network
export const awsEipNatPublicIp = aptosNodeAWS.awsEipNatPublicIp;
export const awsSubnetPrivate = aptosNodeAWS.awsSubnetPrivate;
export const awsSubnetPublic = aptosNodeAWS.awsSubnetPublic;
export const awsVpcCidrBlock = aptosNodeAWS.awsVpcCidrBlock;
export const clusterSecurityGroupId = aptosNodeAWS.clusterSecurityGroupId;
export const vpcId = aptosNodeAWS.vpcId;

// Cluster
export const awsEksCluster = aptosNodeAWS.awsEksCluster;
export const awsEksClusterAuthToken = aptosNodeAWS.awsEksClusterAuthToken;
export const kubeConfig = aptosNodeAWS.kubeConfig;

// Validator
export const fullnodeEndpoint = aptosNodeAWS.fullnodeEndpoint;
export const helmReleaseName = aptosNodeAWS.helmReleaseName;
export const validatorEndpoint = aptosNodeAWS.validatorEndpoint;

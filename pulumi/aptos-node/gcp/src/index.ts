import * as gcp from "@pulumi/gcp";
import * as pulumi from '@pulumi/pulumi';
import { AptosNodeGCP } from "./aptosNodeGCP";
import * as transformations from './transformation';
import * as config from "./config";

const services = [
    "clouderrorreporting.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "container.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
    "spanner.googleapis.com",
];

const serviceResources: { [key: string]: gcp.projects.Service } = {};
// Register the alias transformation on the stack to import from `pulumi import from...`
pulumi.log.info(`Registering aliasTransformation transformation`);
pulumi.runtime.registerStackTransformation(transformations.aliasTransformation);
// Register the addImports transformation on the stack to import from other state
pulumi.log.info(`Registering addImports transformation`);
pulumi.runtime.registerStackTransformation(transformations.addImports);

for (const service of services) {
    serviceResources[service] = new gcp.projects.Service(`services-${service}`, {
        service: service,
        disableOnDestroy: false,
    });
}

const aptosNodeGCP = new AptosNodeGCP("aptos-node-gcp", {
    clusterBootstrap: config.clusterBootstrap,
    project: config.gcpProject,
    region: config.gcpRegion,
    zone: config.dnsConfig.zoneName,
    era: config.era,
    chainId: config.chainId,
    chainName: config.chainName,
    validatorName: config.validatorName,
    imageTag: config.validatorHelmConfig.imageTag,
    helmChart: config.validatorHelmConfig.chartPath,
    helmValues: config.validatorHelmConfig.values,
    helmValuesFile: config.validatorHelmConfig.valuesFilePath,
    k8sApiSources: config.k8sApiSources,
    nodePoolSizes: {},
    utilityInstanceType: config.utilityNodeConfig.machineType,
    utilityInstanceNum: config.utilityNodeConfig.instanceNum,
    utilityInstanceEnableTaint: config.utilityNodeConfig.enableTaint,
    utilityInstanceDiskSizeGb: config.utilityNodeConfig.diskSizeGb,
    validatorInstanceType: config.validatorNodeConfig.machineType,
    validatorInstanceNum: config.validatorNodeConfig.instanceNum,
    validatorInstanceEnableTaint: config.validatorNodeConfig.enableTaint,
    validatorInstanceDiskSizeGb: config.validatorNodeConfig.diskSizeGb,
    enableLogger: config.enableLogging,
    loggerHelmValues: config.loggerHelmConfig.values,
    enableMonitoring: config.enableMonitoring,
    monitoringHelmValues: config.monitoringHelmConfig.values,
    enableNodeExporter: config.enableNodeExporter,
    nodeExporterHelmValues: config.nodeExporterHelmValues,
    manageViaPulumi: config.manageViaPulumi,
    zoneName: config.dnsConfig.zoneName,
    zoneProject: config.dnsConfig.zoneProject,
    workspaceDns: config.dnsConfig.enableDnsRecordCreation,
    recordName: config.dnsConfig.recordName,
    createDnsRecords: config.dnsConfig.enableDnsRecordCreation,
    dnsTtl: config.dnsConfig.dnsTTL,
    gkeEnableNodeAutoprovisioning: config.autoprovisioningConfig.enabled,
    gkeNodeAutoprovisioningMaxCpu: config.autoprovisioningConfig.maxCpu,
    gkeNodeAutoprovisioningMaxMemory: config.autoprovisioningConfig.maxMemory,
    gkeEnableAutoscaling: config.autoscalingConfig.enabled,
    gkeAutoscalingMaxNodeCount: config.autoscalingConfig.maxNodeCount,
    helmReleaseNameOverride: config.validatorHelmConfig.releaseNameOverride,
    workspaceNameOverride: config.workspaceNameOverride,
    clusterIpv4CidrBlock: config.clusterIpv4CidrBlock,
    numValidators: config.validatorNodeConfig.instanceNum,
    numFullnodeGroups: config.validatorNodeConfig.instanceNum,
    gkeMaintenancePolicy: config.gkeMaintenancePolicy,
});

export const helmReleaseName = aptosNodeGCP.helmReleaseName
export const gkeClusterEndpoint = aptosNodeGCP.gkeClusterEndpoint
export const gkeClusterCaCertificate = aptosNodeGCP.gkeClusterCaCertificate
export const gkeClusterWorkloadIdentityConfig = aptosNodeGCP.gkeClusterWorkloadIdentityConfig



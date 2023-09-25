import * as pulumi from "@pulumi/pulumi";

// General Configurations
export const config = new pulumi.Config();
export const workspaceNameOverride = config.get("workspaceNameOverride") || "";
export const workspaceName = workspaceNameOverride || pulumi.getStack();
export const region = config.require("region");

// AWS Configurations
export const awsConfig = new pulumi.Config("aws");
export const numAzs = config.getNumber("numAzs") || 3;
export const kubernetesVersion = config.get("kubernetesVersion") || "1.24";
export const k8sApiSources = config.getObject("k8sApiSources") || ["0.0.0.0/0"];

// Aptos Configurations
export const numValidators = config.getNumber("numValidators") || 1;
export const numFullnodeGroups = config.getNumber("numFullnodeGroups") || 1;
export const era = config.getNumber("era") || 1;
export const chainId = config.get("chainId") || "TESTING";
export const chainName = config.get("chainName") || "testnet";
export const validatorName = config.require("validatorName");
export const imageTag = config.get("imageTag") || "devnet";

// ... (rest of the configurations remain the same, just reordered)

// DNS Configurations
export const zoneId = config.get("zoneId") || "";
export const workspaceDns = config.getBoolean("workspaceDns") || true;
export const recordName = config.get("recordName") || "<workspace>.aptos";
export const createRecords = config.getBoolean("createRecords") || true;

// Helm Configurations
export const helmChart = config.get("helmChart") || "";
export const helmValues = config.getObject("helmValues") || {};
export const helmValuesFile = config.get("helmValuesFile") || "";

// Kubernetes User Configurations
export const k8sAdmins = config.getObject<Array<string>>("k8sAdmins") || [];
export const k8sAdminRoles = config.getObject<Array<string>>("k8sAdminRoles") || [];
export const k8sViewers = config.getObject<Array<string>>("k8sViewers") || [];
export const k8sViewerRoles = config.getObject<Array<string>>("k8sViewerRoles") || [];
export const k8sDebuggers = config.getObject<Array<string>>("k8sDebuggers") || [];
export const k8sDebuggerRoles = config.getObject<Array<string>>("k8sDebuggerRoles") || [];

// IAM Configurations
export const iamPath = config.get("iamPath") || "/";
export const permissionsBoundaryPolicy = config.get("permissionsBoundaryPolicy") || "";

// VPC Configurations
export const vpcCidrBlock = config.get("vpcCidrBlock") || "192.168.0.0/16";
export const maximizeSingleAzCapacity = config.getBoolean("maximizeSingleAzCapacity") || false;

// Utility Node Configurations
export const utilityInstanceType = config.get("utilityInstanceType") || "t3.2xlarge";
export const utilityInstanceNum = config.getNumber("utilityInstanceNum") || 1;
export const utilityInstanceMinNum = config.getNumber("utilityInstanceMinNum") || 1;
export const utilityInstanceMaxNum = config.getNumber("utilityInstanceMaxNum") || 0;
export const utilityInstanceEnableTaint = config.getBoolean("utilityInstanceEnableTaint") || false;

// Validator Node Configurations
export const validatorInstanceType = config.get("validatorInstanceType") || "c6i.8xlarge";
export const validatorInstanceNum = config.getNumber("validatorInstanceNum") || 2;
export const validatorInstanceMinNum = config.getNumber("validatorInstanceMinNum") || 1;
export const validatorInstanceMaxNum = config.getNumber("validatorInstanceMaxNum") || 0;
export const validatorInstanceEnableTaint = config.getBoolean("validatorInstanceEnableTaint") || false;

// Monitoring and Logging Configurations
export const enableCalico = config.getBoolean("enableCalico") || true;
export const enableLogger = config.getBoolean("enableLogger") || false;
export const loggerHelmValues = config.getObject("loggerHelmValues") || {};
export const enableMonitoring = config.getBoolean("enableMonitoring") || false;
export const monitoringHelmValues = config.getObject("monitoringHelmValues") || {};
export const enablePrometheusNodeExporter = config.getBoolean("enablePrometheusNodeExporter") || false;
export const enableKubeStateMetrics = config.getBoolean("enableKubeStateMetrics") || false;

// Miscellaneous Configurations
export const helmReleaseNameOverride = config.get("helmReleaseNameOverride") || "";
export const validatorStorageClass = config.get("validatorStorageClass") || "io1";
export const fullnodeStorageClass = config.get("fullnodeStorageClass") || "io1";
export const manageViaTf = config.getBoolean("manageViaTf") || true;

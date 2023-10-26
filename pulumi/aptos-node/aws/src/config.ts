import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";

// AWS Config
export const awsConfig = new pulumi.Config("aws");
export const region = awsConfig.require("region") as pulumi.Input<string>;
export const profile = awsConfig.require("profile") as pulumi.Input<string>;

// General Configurations
export const config = new pulumi.Config("aptos");
export const workspaceNameOverride = config.get("workspaceNameOverride") || "" as pulumi.Input<string>;
export const workspaceName = workspaceNameOverride || pulumi.getStack();


// AWS Configurations
export const numAzs = config.getNumber("numAzs") || 3 as pulumi.Input<number>;
export const kubernetesVersion = config.get("kubernetesVersion") || "1.24" as pulumi.Input<string>;
export const k8sApiSources = (config.getObject("k8sApiSources") || ["0.0.0.0/0"]) as string[];

// Aptos Configurations
export const numValidators = config.getNumber("numValidators") || 1 as pulumi.Input<number>;
export const numFullnodeGroups = config.getNumber("numFullnodeGroups") || 1 as pulumi.Input<number>;
export const era = config.getNumber("era") || 1 as pulumi.Input<number>;
export const chainId = config.get("chainId") || "TESTING" as pulumi.Input<string>;
export const chainName = config.get("chainName") || "testnet" as pulumi.Input<string>;
export const validatorName = config.require("validatorName") as pulumi.Input<string>;
export const imageTag = config.get("imageTag") || "devnet" as pulumi.Input<string>;

// DNS Configurations
export const zoneId = config.require("zoneId") as pulumi.Input<string>;
export const workspaceDns = config.getBoolean("workspaceDns") || true as pulumi.Input<boolean>;
const recordNameTmp = config.get("recordName") || "<workspace>.aptos" as string;
export const recordName = pulumi.all([workspaceName, recordNameTmp]).apply(([workspaceName, recordNameTmp]) => {
    if (recordNameTmp.includes("<workspace>")) {
        return recordNameTmp.replace("<workspace>", workspaceName);
    } else {
        return recordNameTmp;
    }
});
export const createRecords = config.getBoolean("createRecords") || true as pulumi.Input<boolean>;

// Helm Configurations
export const helmChart = config.get("helmChart") || "" as pulumi.Input<string>;
export const helmValues = config.getObject("helmValues") || {} as any;
export const helmValuesFile = config.get("helmValuesFile") || "" as pulumi.Input<string>;

// Kubernetes User Configurations
export const k8sAdmins = config.getObject<Array<string>>("k8sAdmins") || [] as pulumi.Input<Array<string>>;
export const k8sAdminRoles = config.getObject<Array<string>>("k8sAdminRoles") || [] as pulumi.Input<Array<string>>;
export const k8sViewers = config.getObject<Array<string>>("k8sViewers") || [] as pulumi.Input<Array<string>>;
export const k8sViewerRoles = config.getObject<Array<string>>("k8sViewerRoles") || [] as pulumi.Input<Array<string>>;
export const k8sDebuggers = config.getObject<Array<string>>("k8sDebuggers") || [] as pulumi.Input<Array<string>>;
export const k8sDebuggerRoles = config.getObject<Array<string>>("k8sDebuggerRoles") || [] as pulumi.Input<Array<string>>;

// IAM Configurations
export const iamPath = config.get("iamPath") || "/" as pulumi.Input<string>;
export const permissionsBoundaryPolicy = config.get("permissionsBoundaryPolicy") || "" as pulumi.Input<string>;

// VPC Configurations
export const vpcCidrBlock = config.get("vpcCidrBlock") || "192.168.0.0/16" as string;
export const maximizeSingleAzCapacity = config.getBoolean("maximizeSingleAzCapacity") || false as pulumi.Input<boolean>;
export const azs = config.requireObject<Array<pulumi.Input<string>>>("azs");

// Utility Node Configurations
export const utilityInstanceType = config.get("utilityInstanceType") || "t3.2xlarge" as pulumi.Input<string>;
export const utilityInstanceNum = config.getNumber("utilityInstanceNum") || 1 as pulumi.Input<number>;
export const utilityInstanceMinNum = config.getNumber("utilityInstanceMinNum") || 1 as pulumi.Input<number>;
export const utilityInstanceMaxNum = config.getNumber("utilityInstanceMaxNum") || 1 as pulumi.Input<number>;
export const utilityInstanceEnableTaint = config.getBoolean("utilityInstanceEnableTaint") || false as pulumi.Input<boolean>;

// Validator Node Configurations
export const validatorInstanceType = config.get("validatorInstanceType") || "c6i.8xlarge" as pulumi.Input<string>;
export const validatorInstanceNum = config.getNumber("validatorInstanceNum") || 2 as pulumi.Input<number>;
export const validatorInstanceMinNum = config.getNumber("validatorInstanceMinNum") || 1 as pulumi.Input<number>;
export const validatorInstanceMaxNum = config.getNumber("validatorInstanceMaxNum") || 1 as pulumi.Input<number>;
export const validatorInstanceEnableTaint = config.getBoolean("validatorInstanceEnableTaint") || false as pulumi.Input<boolean>;

// Monitoring and Logging Configurations
export const enableCalico = config.getBoolean("enableCalico") || true as pulumi.Input<boolean>;
export const enableLogger = config.getBoolean("enableLogger") || false as pulumi.Input<boolean>;
export const loggerHelmValues = config.getObject("loggerHelmValues") || {} as any;
export const enableMonitoring = config.getBoolean("enableMonitoring") || false as pulumi.Input<boolean>;
export const monitoringHelmValues = config.getObject("monitoringHelmValues") || {} as any;
export const enablePrometheusNodeExporter = config.getBoolean("enablePrometheusNodeExporter") || false as pulumi.Input<boolean>;
export const enableKubeStateMetrics = config.getBoolean("enableKubeStateMetrics") || false as pulumi.Input<boolean>;

// Miscellaneous Configurations
export const helmReleaseNameOverride = config.get("helmReleaseNameOverride") || "" as pulumi.Input<string>;
export const validatorStorageClass = config.get("validatorStorageClass") || "io1" as pulumi.Input<string>;
export const fullnodeStorageClass = config.get("fullnodeStorageClass") || "io1" as pulumi.Input<string>;
export const manageViaPulumi = config.getBoolean("manageViaPulumi") || true as pulumi.Input<boolean>;

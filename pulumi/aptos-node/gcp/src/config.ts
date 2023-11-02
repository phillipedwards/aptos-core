import * as pulumi from "@pulumi/pulumi";

export interface helmConfig {
    chartPath: pulumi.Input<string>;
    imageTag: pulumi.Input<string>;
    valuesFilePath: pulumi.Input<string>;
    values: pulumi.Input<any>;
    version: pulumi.Input<string>;
    releaseNameOverride?: string;
}

const localRepoHelmChartsDirPath = `/../../../../terraform/helm`;

const validatorDefaultHelmConfig: Partial<helmConfig> = {
    chartPath: `${localRepoHelmChartsDirPath}/aptos-node`,
    imageTag: "devnet",
    valuesFilePath: "",
    values: {},
    version: "1.0.0",
    releaseNameOverride: "",
};

const monitoringDefaultHelmConfig: Partial<helmConfig> = {
    chartPath: `${localRepoHelmChartsDirPath}/monitoring`,
    imageTag: "",
    valuesFilePath: "",
    values: {},
    version: "1.0.0",
    releaseNameOverride: "",
};

const loggerDefaultHelmConfig: Partial<helmConfig> = {
    chartPath: `${localRepoHelmChartsDirPath}/logger`,
    imageTag: "",
    valuesFilePath: "",
    values: {},
    version: "1.0.0",
    releaseNameOverride: "",
};

export interface NodeConfig {
    machineType: pulumi.Input<string>;
    diskSizeGb: pulumi.Input<number>;
    instanceNum: pulumi.Input<number>;
    enableTaint: pulumi.Input<boolean>;
}

const validatorDefaultNodeConfig: Partial<NodeConfig> = {
    machineType: "n2-standard-32",
    diskSizeGb: 20,
    instanceNum: 2,
    enableTaint: false,
};

const utilitiesDefaultNodeConfig: Partial<NodeConfig> = {
    machineType: "n2-standard-8",
    diskSizeGb: 20,
    instanceNum: 1,
    enableTaint: false,
};

export interface autoscalingConfig {
    enabled: pulumi.Input<boolean>;
    minNodeCount: pulumi.Input<number>;
    maxNodeCount: pulumi.Input<number>;
    desiredNodeCount: pulumi.Input<number>;
}

export interface autoprovisioningConfig {
    enabled: pulumi.Input<boolean>;
    maxCpu: pulumi.Input<number>;
    maxMemory: pulumi.Input<number>;
}

const defaultAutoscalingConfig: Partial<autoscalingConfig> = {
    enabled: false,
    minNodeCount: 1,
    maxNodeCount: 10,
    desiredNodeCount: 1,
};

const defaultAutoprovisioningConfig: Partial<autoprovisioningConfig> = {
    enabled: false,
    maxCpu: 10,
    maxMemory: 100,
};

export interface gkeMaintenancePolicy {
    recurringWindow: {
        startTime: pulumi.Input<string>;
        endTime: pulumi.Input<string>;
        recurrence: pulumi.Input<string>;
    }
}

const defaultGkeMaintenancePolicy: Partial<gkeMaintenancePolicy> = {
    recurringWindow: {
        startTime: "2023-06-15T00:00:00Z",
        endTime: "2023-06-15T23:59:00Z",
        recurrence: "FREQ=DAILY",
    },
};

export interface DnsConfig {
    zoneName: string;
    zoneProject: pulumi.Input<string>;
    dnsGCPZoneSuffix: pulumi.Input<string>;
    dnsTTL: pulumi.Input<number>;
    enableDnsRecordCreation: pulumi.Input<boolean>;
    recordName: pulumi.Input<string>;
}

const defaultDnsConfig: Partial<DnsConfig> = {
    zoneName: "",
    zoneProject: "",
    dnsGCPZoneSuffix: "",
    dnsTTL: 300,
    enableDnsRecordCreation: false,
};


// General Configurations
export const clusterBootstrap = new pulumi.Config("aptos").getBoolean("bootstrap") || false;
export const workspaceNameOverride = new pulumi.Config("aptos").get("workspaceNameOverride") || "";
export const autoscalingConfig = {
    ...defaultAutoscalingConfig,
    ...new pulumi.Config("aptos").getObject("autoscalingConfig") as autoscalingConfig,
};
export const autoprovisioningConfig = {
    ...defaultAutoprovisioningConfig,
    ...new pulumi.Config("aptos").getObject("autoprovisioningConfig") as autoprovisioningConfig,
};
export const validatorName = new pulumi.Config("aptos").require("validatorName");
export const manageViaPulumi: pulumi.Input<boolean> = new pulumi.Config("").getBoolean("manageViaPulumi") || true;

// Feature Flags
export const enableMonitoring = new pulumi.Config("featureFlags").getBoolean("enableMonitoring") || false;
export const enableLogging = new pulumi.Config("featureFlags").getBoolean("enableLogging") || false;
export const enableNodeExporter = new pulumi.Config("featureFlags").getBoolean("enableNodeExporter") || false;

// GCP Configurations
export const gcpProject = new pulumi.Config("gcp").require("project");
export const gcpRegion = new pulumi.Config("gcp").require("region");
export const gcpZone = new pulumi.Config("gcp").require("zone");
export const gkeMaintenancePolicy = {
    ...defaultGkeMaintenancePolicy,
    ...new pulumi.Config("gcp").getObject("gkeMaintenancePolicy") as gkeMaintenancePolicy,
};

// Network Configurations
export const k8sApiSources = new pulumi.Config("network").getObject("k8sApiSources") as string[] || ["0.0.0.0/0"];
export const clusterIpv4CidrBlock = new pulumi.Config("network").get("clusterIpv4CidrBlock") || "";

// Chain Configurations
export const era = parseInt(new pulumi.Config("chain").get("era") || "1");
export const chainId = new pulumi.Config("chain").get("id") || "TESTING";
export const chainName = new pulumi.Config("chain").get("name") || "testnet";

// DNS Configurations
export const dnsConfig = {
    ...defaultDnsConfig,
    ...new pulumi.Config("dns").getObject("config") as DnsConfig,
};

// Helm Configurations
export const validatorHelmConfig = {
    ...validatorDefaultHelmConfig,
    ...new pulumi.Config("helm").getObject("validator") as helmConfig,
};
export const monitoringHelmConfig = {
    ...monitoringDefaultHelmConfig,
    ...new pulumi.Config("helm").getObject("monitoring") as helmConfig,
};
export const loggerHelmConfig = {
    ...loggerDefaultHelmConfig,
    ...new pulumi.Config("helm").getObject("logger") as helmConfig,
};
export const nodeExporterHelmValues = new pulumi.Config("helm").getObject("nodeExporterHelmValues") as any;

// Node Configurations
export const utilityNodeConfig = {
    ...utilitiesDefaultNodeConfig,
    ...new pulumi.Config("utility").getObject("node") as NodeConfig,
};
export const validatorNodeConfig = {
    ...validatorDefaultNodeConfig,
    ...new pulumi.Config("validator").getObject("node") as NodeConfig,
};

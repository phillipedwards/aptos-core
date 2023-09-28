import * as pulumi from "@pulumi/pulumi";

// GCP Configurations
export const gcpProject = new pulumi.Config("gcp").require("project");
export const gcpRegion = new pulumi.Config("gcp").require("region");
export const gcpZone = new pulumi.Config("gcp").require("zone");

// Aptos Configurations
export const aptosNodeName = new pulumi.Config("aptos").require("nodeName");
export const aptosNodeNamespace = new pulumi.Config("aptos").require("nodeNamespace");
export const aptosNodeVersion = new pulumi.Config("aptos").require("nodeVersion");

// DNS Configurations
export const dnsZoneName = new pulumi.Config("dns").require("zoneName");
export const dnsZoneDomain = new pulumi.Config("dns").require("zoneDomain");

// Helm Configurations
export const helmChartName = new pulumi.Config("helm").require("chartName");
export const helmChartVersion = new pulumi.Config("helm").require("chartVersion");

// Kubernetes User Configurations
export const k8sAdminUsername = new pulumi.Config("k8s").require("adminUsername");
export const k8sAdminPassword = new pulumi.Config("k8s").requireSecret("adminPassword");

// IAM Configurations
export const iamServiceAccountName = new pulumi.Config("iam").require("serviceAccountName");

// VPC Configurations
export const vpcName = new pulumi.Config("vpc").require("name");
export const vpcCidrBlock = new pulumi.Config("vpc").require("cidrBlock");

// Utility Node Configurations
export const utilityNodeMachineType = new pulumi.Config("utilityNode").require("machineType");
export const utilityNodeDiskSizeGb = new pulumi.Config("utilityNode").require("diskSizeGb");

// Validator Node Configurations
export const validatorNodeMachineType = new pulumi.Config("validatorNode").require("machineType");
export const validatorNodeDiskSizeGb = new pulumi.Config("validatorNode").require("diskSizeGb");

// Monitoring and Logging Configurations
export const monitoringEnabled = new pulumi.Config("monitoring").getBoolean("enabled") || false;
export const loggingEnabled = new pulumi.Config("logging").getBoolean("enabled") || false;


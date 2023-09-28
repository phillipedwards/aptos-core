import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/gcp';

import {
    // GCP Configurations
    gcpProject,
    gcpRegion,
    gcpZone,
    // Aptos Configurations
    aptosNodeName,
    aptosNodeNamespace,
    aptosNodeVersion,
    // DNS Configurations
    dnsZoneName,
    dnsZoneDomain,
    // Helm Configurations
    helmChartName,
    helmChartVersion,
    // Kubernetes User Configurations
    k8sAdminUsername,
    k8sAdminPassword,
    // IAM Configurations
    iamServiceAccountName,
    // VPC Configurations
    vpcName,
    vpcCidrBlock,
    // Utility Node Configurations
    utilityNodeMachineType,
    utilityNodeDiskSizeGb,
    // Validator Node Configurations
    validatorNodeMachineType,
    validatorNodeDiskSizeGb,
    // Monitoring and Logging Configurations
    monitoringEnabled,
    loggingEnabled,
} from "./config";

import { Auth } from "./auth";
import { Cluster } from "./cluster";
import { Dns } from "./dns";
import { Network } from "./network";
import { Kubernetes } from "./kubernetes";
import { Security } from "./security";
import { node } from '@pulumi/kubernetes';


export class AptosNodeGCP extends pulumi.ComponentResource {
    public readonly auth: Auth;
    public readonly cluster: Cluster;
    public readonly dns: Dns;
    public readonly network: Network;
    public readonly kubernetes: Kubernetes;
    public readonly security: Security;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:AptosNodeGCP", name, opts);

        this.auth = new Auth("auth", {
            projectId: gcpProject,
        }, { parent: this });

        this.network = new Network("network", {
            networkName: vpcName,
            subnetworkNames: ["default"],
        }, { parent: this });

        this.security = new Security("security", {
            namespace: aptosNodeNamespace,
        }, { parent: this });

        this.cluster = new Cluster("cluster", {
            name: name,
            version: aptosNodeVersion,
            region: gcpRegion,
            zone: gcpZone,
            project: gcpProject,
            network: this.network,
            security: this.security,
            monitoringEnabled: monitoringEnabled,
            loggingEnabled: loggingEnabled,
            location: gcpZone,
            nodePoolConfigs: [
                {
                    name: "validator",
                    diskSizeGb: Number(validatorNodeDiskSizeGb),
                    diskType: "gp3",
                    machineType: validatorNodeMachineType,
                    maxNodeCount: 1,
                    minNodeCount: 1,
                },
                {
                    name: "utility",
                    diskSizeGb: Number(utilityNodeDiskSizeGb),
                    diskType: "gp3",
                    machineType: utilityNodeMachineType,
                    maxNodeCount: 1,
                    minNodeCount: 1,
                },
            ]
        }, { parent: this });

        this.kubernetes = new Kubernetes("kubernetes", {
            namespace: aptosNodeNamespace,
            aptosNodeHelmChartPath: aptosNodeHelmChartPath,
            helmReleaseName: helmReleaseName,
            loggerHelmChartPath: loggerHelmChartPath,
            monitoringHelmChartPath: monitoringHelmChartPath,
            enableNodeExporter: enableNodeExporter,
            nodeExporterHelmValues: nodeExporterHelmValues,
        }, { parent: this });

        this.dns = new Dns("dns", {
            domainName: dnsZoneDomain,
            fullnodeIp: this.cluster.
                validatorIp: ,
        }, { parent: this });


    }
}

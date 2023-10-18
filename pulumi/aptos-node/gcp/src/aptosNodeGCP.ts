import * as aws from '@pulumi/gcp';
import { node } from '@pulumi/kubernetes';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import { Auth } from "./auth";
import { Cluster } from "./cluster";
import * as config from "./config";
import { Dns } from "./dns";
import { Kubernetes } from "./kubernetes";
import { Network } from "./network";
import { Security } from "./security";

export class AptosNodeGCP extends pulumi.ComponentResource {
    public readonly auth: Auth;
    public readonly cluster: Cluster;
    public readonly dns: Dns | undefined;
    public readonly network: Network;
    public readonly kubernetes: Kubernetes;
    public readonly security: Security;
    public readonly helmReleaseName: pulumi.Output<string>;
    public readonly gkeClusterEndpoint: pulumi.Output<string>;
    public readonly gkeClusterCaCertificate: pulumi.Output<string>;
    public readonly gkeClusterWorkloadIdentityConfig: pulumi.Output<string>;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:AptosNodeGCP", name, opts);

        const workspace = (config.workspaceNameOverride === "" ? pulumi.interpolate`${pulumi.getProject()}-${pulumi.getStack()}` : pulumi.interpolate`${config.workspaceNameOverride}`);

        this.auth = new Auth("auth", {
            projectId: config.gcpProject,
            workspace: workspace,
        }, { parent: this });

        this.network = new Network("network", {
            networkName: workspace,
            subnetworkNames: ["default"],
            workspace: workspace,
        }, { parent: this });

        this.security = new Security("security", {
        }, { parent: this });

        // new command.local.Command(`xyz`, {
        //     create: pulumi.interpolate`echo ${JSON.stringify(config)}`,
        // }, {
        //     parent: this
        // });

        this.cluster = new Cluster("cluster", {
            name: pulumi.interpolate`aptos-${workspace}`,
            projectId: config.gcpProject,
            location: config.gcpZone,
            network: this.network.network,
            clusterIpv4CidrBlock: config.clusterIpv4CidrBlock,
            autoscalingConfig: {
                gkeAutoscalingMaxNodeCount: config.autoscalingConfig.maxNodeCount,
                gkeAutoscalingMinNodeCount: config.autoscalingConfig.minNodeCount,
                gkeAutoscalingDesiredNodeCount: config.autoscalingConfig.desiredNodeCount,
                gkeEnableAutoscaling: config.autoscalingConfig.enabled,
                gkeEnableNodeAutoprovisioning: config.autoprovisioningConfig.enabled,
                gkeNodeAutoprovisioningMaxCpu: config.autoprovisioningConfig.maxCpu,
                gkeNodeAutoprovisioningMaxMemory: config.autoprovisioningConfig.maxMemory,
            },
            gkeMaintenancePolicy: config.gkeMaintenancePolicy,
            googleServiceAccountEmail: this.auth.gkeServiceAccount.email,
            k8sApiSources: config.k8sApiSources,
            nodePoolConfigsForUtilities: {
                name: "utilities",
                diskSizeGb: config.utilityNodeConfig.diskSizeGb,
                enableTaints: config.utilityNodeConfig.enableTaint,
                machineType: config.utilityNodeConfig.machineType,
                maxNodeCount: config.autoscalingConfig.maxNodeCount,
                minNodeCount: config.utilityNodeConfig.instanceNum,
            },
            nodePoolConfigsForValidators: {
                name: "validators",
                diskSizeGb: config.validatorNodeConfig.diskSizeGb,
                enableTaints: config.validatorNodeConfig.enableTaint,
                machineType: config.validatorNodeConfig.machineType,
                maxNodeCount: config.autoscalingConfig.maxNodeCount,
                minNodeCount: config.validatorNodeConfig.instanceNum,
            },
        }, {
            dependsOn: [
                this.network,
                this.auth,
                this.security,
            ],
            parent: this,
        });

        this.kubernetes = new Kubernetes("kubernetes", {
            aptosNodeHelmChartPath: config.validatorHelmConfig.chartPath,
            gkeEnableNodeAutoprovisioning: String(config.autoprovisioningConfig.enabled),
            numValidators: config.validatorNodeConfig.instanceNum,
            numFullnodeGroups: config.utilityNodeConfig.instanceNum,
            validatorName: config.validatorName,
            validatorNodePool: this.cluster.validatorsNodePool,
            nodeExporterHelmValues: config.nodeExporterHelmValues,
            chainId: config.chainId,
            chainName: config.chainName,
            era: config.era,
            validatorHelmConfig: config.validatorHelmConfig,
            loggerHelmConfig: config.loggerHelmConfig,
            monitoringHelmConfig: config.monitoringHelmConfig,
            enableMonitoring: config.enableMonitoring,
            enableLogger: config.enableLogging,
            enableNodeExporter: config.enableNodeExporter,
            cluster: this.cluster.cluster,
            utilityNodePool: this.cluster.utilitiesNodePool,
            workspace: workspace,
        }, {
            dependsOn: [
                this.cluster,
            ],
            parent: this
        });

        this.dns = undefined

        if (config.dnsConfig.enableDnsRecordCreation) {
            this.dns = new Dns("dns", {
                k8sProvider: this.kubernetes.provider,
                createDnsRecords: config.dnsConfig.enableDnsRecordCreation,
                dnsTtl: config.dnsConfig.dnsTTL,
                zoneName: config.dnsConfig.zoneName,
                domainName: config.dnsConfig.zoneName,
                fullnodeIp: "",
                validatorIp: "",
                workspace: workspace,
                recordName: config.validatorName,
            }, {
                dependsOn: [
                    this.kubernetes,
                    this.kubernetes.validatorHelmRelease,
                    this.kubernetes.monitoringHelmRelease,
                    this.kubernetes.loggerHelmRelease,
                    this.kubernetes.nodeExporterHelmRelease,
                ].filter(x => x !== undefined) as pulumi.Resource[],
                parent: this
            });
        }

        this.helmReleaseName = this.kubernetes.validatorHelmRelease.name;
        this.gkeClusterEndpoint = this.cluster.cluster.endpoint;
        this.gkeClusterCaCertificate = this.cluster.cluster.masterAuth.clusterCaCertificate;
        this.gkeClusterWorkloadIdentityConfig = this.cluster.cluster.workloadIdentityConfig.apply(wic => JSON.stringify(wic));
    }
}

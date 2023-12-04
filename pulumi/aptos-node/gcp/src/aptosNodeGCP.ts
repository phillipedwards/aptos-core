import * as pulumi from '@pulumi/pulumi';
import { Auth } from "./auth";
import { Cluster } from "./cluster";
import * as config from "./config";
import { Dns } from "./dns";
import { Kubernetes } from "./kubernetes";
import { Network } from "./network";
import { Security } from "./security";

interface GcpArgs {
    // Set when bootstrapping a new cluster
    clusterBootstrap?: pulumi.Input<boolean>,
    // GCP project
    project: pulumi.Input<string>,
    // GCP region
    region: pulumi.Input<string>,
    // GCP zone suffix
    zone: pulumi.Input<string>,
    // Chain era, used to start a clean chain
    era?: pulumi.Input<number>,
    // Aptos chain ID
    chainId?: pulumi.Input<string>,
    // Aptos chain name
    chainName?: pulumi.Input<string>,
    // Name of the validator node owner
    validatorName: pulumi.Input<string>,
    // Docker image tag for Aptos node
    imageTag?: pulumi.Input<string>,
    // Path to aptos-validator Helm chart file
    helmChart?: pulumi.Input<string>,
    // Map of values to pass to Helm
    helmValues?: pulumi.Input<any>,
    // Path to file containing values for Helm chart
    helmValuesFile?: pulumi.Input<string>,
    // List of CIDR subnets which can access the Kubernetes API endpoint
    k8sApiSources?: pulumi.Input<any>,
    // Override the number of nodes in the specified pool
    nodePoolSizes?: pulumi.Input<Record<string, pulumi.Input<number>>>,
    // Instance type used for utilities
    utilityInstanceType?: pulumi.Input<string>,
    // Number of instances for utilities
    utilityInstanceNum?: pulumi.Input<number>,
    // Whether to taint the instances in the utility nodegroup
    utilityInstanceEnableTaint?: pulumi.Input<boolean>,
    // Disk size for utility instances
    utilityInstanceDiskSizeGb?: pulumi.Input<number>,
    // Instance type used for validator and fullnodes
    validatorInstanceType?: pulumi.Input<string>,
    // Number of instances used for validator and fullnodes
    validatorInstanceNum?: pulumi.Input<number>,
    // Whether to taint instances in the validator nodegroup
    validatorInstanceEnableTaint?: pulumi.Input<boolean>,
    // Disk size for validator instances
    validatorInstanceDiskSizeGb?: pulumi.Input<number>,
    // Enable logger helm chart
    enableLogger?: pulumi.Input<boolean>,
    // Map of values to pass to logger Helm
    loggerHelmValues?: pulumi.Input<any>,
    // Enable monitoring helm chart
    enableMonitoring?: pulumi.Input<boolean>,
    // Map of values to pass to monitoring Helm
    monitoringHelmValues?: pulumi.Input<any>,
    // Enable Prometheus node exporter helm chart
    enableNodeExporter?: pulumi.Input<boolean>,
    // Map of values to pass to node exporter Helm
    nodeExporterHelmValues?: pulumi.Input<any>,
    // Whether to manage the aptos-node k8s workload via Terraform. If set to false, the helm_release resource will still be created and updated when values change, but it may not be updated on every apply
    manageViaPulumi?: pulumi.Input<boolean>,
    // Zone name of GCP Cloud DNS zone to create records in
    zoneName?: pulumi.Input<string>,
    // GCP project which the DNS zone is in (if different)
    zoneProject?: pulumi.Input<string>,
    // Include Terraform workspace name in DNS records
    workspaceDns?: pulumi.Input<boolean>,
    // DNS record name to use (<workspace> is replaced with the TF workspace name)
    recordName?: pulumi.Input<string>,
    // Creates DNS records in var.zone_name that point to k8s service, as opposed to using external-dns or other means
    createDnsRecords?: pulumi.Input<boolean>,
    // Time-to-Live for the Validator and Fullnode DNS records
    dnsTtl?: pulumi.Input<number>,
    // Enable node autoprovisioning for GKE cluster. See https://cloud.google.com/kubernetes-engine/docs/how-to/node-auto-provisioning
    gkeEnableNodeAutoprovisioning?: pulumi.Input<boolean>,
    // Maximum CPU utilization for GKE node_autoprovisioning
    gkeNodeAutoprovisioningMaxCpu?: pulumi.Input<number>,
    // Maximum memory utilization for GKE node_autoprovisioning
    gkeNodeAutoprovisioningMaxMemory?: pulumi.Input<number>,
    // Enable autoscaling for the nodepools in the GKE cluster. See https://cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler
    gkeEnableAutoscaling?: pulumi.Input<boolean>,
    // Maximum number of nodes for GKE nodepool autoscaling
    gkeAutoscalingMaxNodeCount?: pulumi.Input<number>,
    // If set, overrides the name of the aptos-node helm chart
    helmReleaseNameOverride?: pulumi.Input<string>,
    // If specified, overrides the usage of Terraform workspace for naming purposes
    workspaceNameOverride?: pulumi.Input<string>,
    // The IP address range of the container pods in this cluster, in CIDR notation. See https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/container_cluster#cluster_ipv4_cidr_block
    clusterIpv4CidrBlock?: pulumi.Input<string>,
    // The number of validator nodes to create
    numValidators?: pulumi.Input<number>,
    // The number of fullnode groups to create
    numFullnodeGroups?: pulumi.Input<number>,
    // The maintenance policy to use for the cluster. See https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/container_cluster#maintenance_policy
    gkeMaintenancePolicy?: {
        recurringWindow?: pulumi.Input<any>,
    },
}

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

    constructor(name: string, args: GcpArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:AptosNodeGCP", name, opts);

        args.clusterBootstrap = args.clusterBootstrap || false;
        args.era = args.era || 1;
        args.chainId = args.chainId || "TESTING";
        args.chainName = args.chainName || "testnet";
        args.imageTag = args.imageTag || "devnet";
        args.helmChart = args.helmChart || "";
        args.helmValues = args.helmValues || {};
        args.helmValuesFile = args.helmValuesFile || "";
        args.k8sApiSources = args.k8sApiSources || ["0.0.0.0/0"];
        args.nodePoolSizes = args.nodePoolSizes || {};
        args.utilityInstanceType = args.utilityInstanceType || "n2-standard-8";
        args.utilityInstanceNum = args.utilityInstanceNum || 1;
        args.utilityInstanceEnableTaint = args.utilityInstanceEnableTaint || false;
        args.utilityInstanceDiskSizeGb = args.utilityInstanceDiskSizeGb || 20;
        args.validatorInstanceType = args.validatorInstanceType || "n2-standard-32";
        args.validatorInstanceNum = args.validatorInstanceNum || 2;
        args.validatorInstanceEnableTaint = args.validatorInstanceEnableTaint || false;
        args.validatorInstanceDiskSizeGb = args.validatorInstanceDiskSizeGb || 20;
        args.enableLogger = args.enableLogger || false;
        args.loggerHelmValues = args.loggerHelmValues || {};
        args.enableMonitoring = args.enableMonitoring || false;
        args.monitoringHelmValues = args.monitoringHelmValues || {};
        args.enableNodeExporter = args.enableNodeExporter || false;
        args.nodeExporterHelmValues = args.nodeExporterHelmValues || {};
        args.manageViaPulumi = args.manageViaPulumi || true;
        args.zoneName = args.zoneName || "";
        args.zoneProject = args.zoneProject || "";
        args.workspaceDns = args.workspaceDns || true;
        args.recordName = args.recordName || "<workspace>.aptos";
        args.createDnsRecords = args.createDnsRecords || true;
        args.dnsTtl = args.dnsTtl || 300;
        args.gkeEnableNodeAutoprovisioning = args.gkeEnableNodeAutoprovisioning || false;
        args.gkeNodeAutoprovisioningMaxCpu = args.gkeNodeAutoprovisioningMaxCpu || 10;
        args.gkeNodeAutoprovisioningMaxMemory = args.gkeNodeAutoprovisioningMaxMemory || 100;
        args.gkeEnableAutoscaling = args.gkeEnableAutoscaling || true;
        args.gkeAutoscalingMaxNodeCount = args.gkeAutoscalingMaxNodeCount || 10;
        args.helmReleaseNameOverride = args.helmReleaseNameOverride || "";
        args.workspaceNameOverride = args.workspaceNameOverride || "";
        args.clusterIpv4CidrBlock = args.clusterIpv4CidrBlock || "";
        args.numValidators = args.numValidators || 1;
        args.numFullnodeGroups = args.numFullnodeGroups || 1;
        args.gkeMaintenancePolicy = args.gkeMaintenancePolicy || {
            recurringWindow: {
                endTime: "2023-06-15T23:59:00Z",
                recurrence: "FREQ=DAILY",
                startTime: "2023-06-15T00:00:00Z",
            },
        };

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

        this.cluster = new Cluster("cluster", {
            name: pulumi.interpolate`aptos-${workspace}`,
            projectId: config.gcpProject,
            location: config.gcpZone,
            network: this.network.network,
            clusterIpv4CidrBlock: config.clusterIpv4CidrBlock,
            autoscalingConfig: {
                profile: config.autoscalingConfig.profile,
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
                sysctls: config.utilityNodeConfig.sysctls,
                diskSizeGb: config.utilityNodeConfig.diskSizeGb,
                enableTaints: config.utilityNodeConfig.enableTaint,
                machineType: config.utilityNodeConfig.machineType,
                maxNodeCount: config.autoscalingConfig.maxNodeCount,
                minNodeCount: config.utilityNodeConfig.instanceNum,
            },
            nodePoolConfigsForValidators: {
                name: "validators",
                sysctls: config.validatorNodeConfig.sysctls,
                diskSizeGb: config.validatorNodeConfig.diskSizeGb,
                enableTaints: config.validatorNodeConfig.enableTaint,
                machineType: config.validatorNodeConfig.machineType,
                maxNodeCount: config.autoscalingConfig.maxNodeCount,
                minNodeCount: config.validatorNodeConfig.instanceNum,
            },
            nodePoolConfigsForCore: {
                name: "core",
                sysctls: config.coreNodeConfig.sysctls,
                diskSizeGb: config.coreNodeConfig.diskSizeGb,
                enableTaints: config.coreNodeConfig.enableTaint,
                machineType: config.coreNodeConfig.machineType,
                maxNodeCount: config.autoscalingConfig.maxNodeCount,
                minNodeCount: config.coreNodeConfig.instanceNum,
            },
            enableDns: config.enableCloudDNS,
            enableImageStreaming: config.enableImageStreaming,
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
            cluster: this.cluster.cluster,
            utilityNodePool: this.cluster.utilitiesNodePool,
            manageViaPulumi: config.manageViaPulumi,
            workspace: workspace,
            gkeEnableTaint: config.validatorNodeConfig.enableTaint,
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
                    this.kubernetes.helmReleaseForValidator,
                ].filter(x => x !== undefined) as pulumi.Resource[],
                parent: this
            });
        }

        this.helmReleaseName = this.kubernetes.helmReleaseForValidator.name;
        this.gkeClusterEndpoint = this.cluster.cluster.endpoint;
        this.gkeClusterCaCertificate = this.cluster.cluster.masterAuth.clusterCaCertificate;
        this.gkeClusterWorkloadIdentityConfig = this.cluster.cluster.workloadIdentityConfig.apply(wic => JSON.stringify(wic));
    }
}

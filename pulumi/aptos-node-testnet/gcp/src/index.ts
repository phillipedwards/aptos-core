import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as std from "@pulumi/std";
import { AptosNodeGCP } from "../../../aptos-node/gcp/src/aptosNodeGCP";
// import * as transformations from './transformation';
import * as crypto from "crypto";
import * as fs from "fs";

type AptosNodeHelmValues = {
    fullnode?: {
        groups?: string[],
    },
};

function notImplemented(message: string) {
    throw new Error(message);
}

function computeSha1ForHelmRelease(chartPathOutput: Promise<std.AbspathResult>): crypto.Hash {
    const filesOutput = pulumi.all([chartPathOutput]).apply(([path]) => {
        return fs.readdirSync(path.result);
    });

    let sha1sumForHelmRelease = crypto.createHash('sha1');

    pulumi.all([filesOutput, chartPathOutput]).apply(([files, path]) => {
        for (const f of files) {
            const data = fs.readFileSync(`${path}/${f}`);
            sha1sumForHelmRelease.update(data);
        }
    });

    return sha1sumForHelmRelease;
}

const privilegedPssLabels = {
    "pod-security.kubernetes.io/audit": "baseline",
    "pod-security.kubernetes.io/warn": "baseline",
    "pod-security.kubernetes.io/enforce": "privileged",
};
const baselinePssLabels = {
    "pod-security.kubernetes.io/audit": "restricted",
    "pod-security.kubernetes.io/warn": "restricted",
    "pod-security.kubernetes.io/enforce": "baseline",
};
const restrictedPssLabels = {
    "pod-security.kubernetes.io/enforce": "restricted",
};

const k8sNamespaceForPssChaosMesh = new k8s.core.v1.Namespace("pss-chaos-mesh", {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
        name: "chaos-mesh",
        labels: privilegedPssLabels,
    },
});

const config = new pulumi.Config();
// Set when bootstrapping a new cluster
const clusterBootstrap: pulumi.Input<boolean> = config.getBoolean("clusterBootstrap") || false;
// GCP project
const project: pulumi.Input<string> = config.require("project");
// GCP region
const region: pulumi.Input<string> = config.require("region");
// GCP zone suffix
const zone: pulumi.Input<string> = config.require("zone");
// Whether to manage the aptos-node k8s workload via Terraform. If set to false, the helm_release resource will still be created and updated when values change, but it may not be updated on every apply
const manageViaPulumi: pulumi.Input<boolean> = config.getBoolean("manageViaPulumi") || true;
// Chain era, used to start a clean chain
const era: pulumi.Input<number> = config.getNumber("era") || 1;
// Aptos chain ID
const chainId: pulumi.Input<string> = config.get("chainId") || "TESTING";
// Aptos chain name
const chainName: pulumi.Input<string> = config.get("chainName") || "testnet";
// Docker image tag for Aptos node
const imageTag: pulumi.Input<string> = config.get("imageTag") || "devnet";
// Include Terraform workspace name in DNS records
const workspaceDns: pulumi.Input<boolean> = config.getBoolean("workspaceDns") || true;
// DNS prefix for fullnode url
const dnsPrefixName: pulumi.Input<string> = config.get("dnsPrefixName") || "fullnode";
// Zone name of GCP Cloud DNS zone to create records in
const zoneName: pulumi.Input<string> = config.get("zoneName") || "";
// GCP project which the DNS zone is in (if different)
const zoneProject: pulumi.Input<string> = config.get("zoneProject") || "";
// DNS record name to use (<workspace> is replaced with the TF workspace name)
const recordName: pulumi.Input<string> = config.get("recordName") || "<workspace>.aptos";
// Creates DNS records in var.zone_name that point to k8s service, as opposed to using external-dns or other means
const createDnsRecords: pulumi.Input<boolean> = config.getBoolean("createDnsRecords") || true;
// Time-to-Live for the Validator and Fullnode DNS records
const dnsTtl: pulumi.Input<number> = config.getNumber("dnsTtl") || 300;
// If specified, overrides the usage of Terraform workspace for naming purposes
const workspaceNameOverride: pulumi.Input<string> = config.get("workspaceNameOverride") || "";
// If set, overrides the name of the aptos-node helm chart
const helmReleaseNameOverride: pulumi.Input<string> = config.get("helmReleaseNameOverride") || "";
// Map of values to pass to aptos-node helm chart
const aptosNodeHelmValues: pulumi.Input<AptosNodeHelmValues> = config.getObject<AptosNodeHelmValues>("aptosNodeHelmValues") || {};
// Map of values to pass to genesis helm chart
const genesisHelmValues: pulumi.Input<object> = config.getObject("genesisHelmValues") || {};
// Map of values to pass to Forge Helm
const forgeHelmValues: pulumi.Input<object> = config.getObject("forgeHelmValues") || {};
// The number of validator nodes to create
const numValidators: pulumi.Input<number> = config.getNumber("numValidators") || 1;
// The number of fullnode groups to create
const numFullnodeGroups: pulumi.Input<number> = config.getNumber("numFullnodeGroups") || 1;
// List of CIDR subnets which can access the Kubernetes API endpoint
const k8sApiSources: pulumi.Input<object> = config.getObject("k8sApiSources") || ["0.0.0.0/0"];
// Instance type used for utilities
const utilityInstanceType: pulumi.Input<string> = config.get("utilityInstanceType") || "n2-standard-8";
// Instance type used for validator and fullnodes
const validatorInstanceType: pulumi.Input<string> = config.get("validatorInstanceType") || "n2-standard-32";
// Enable Forge
const enableForge: pulumi.Input<boolean> = config.getBoolean("enableForge") || false;
// Enable monitoring helm chart
const enableMonitoring: pulumi.Input<boolean> = config.getBoolean("enableMonitoring") || false;
// Map of values to pass to monitoring Helm
const monitoringHelmValues: pulumi.Input<object> = config.getObject("monitoringHelmValues") || {};
// Enable prometheus-node-exporter within monitoring helm chart
const enablePrometheusNodeExporter: pulumi.Input<boolean> = config.getBoolean("enablePrometheusNodeExporter") || false;
// Map of values to pass to testnet-addons helm chart
const testnetAddonsHelmValues: pulumi.Input<object> = config.getObject("testnetAddonsHelmValues") || {};
// Enable node autoprovisioning for GKE cluster. See https://cloud.google.com/kubernetes-engine/docs/how-to/node-auto-provisioning
const gkeEnableNodeAutoprovisioning: pulumi.Input<boolean> = config.getBoolean("gkeEnableNodeAutoprovisioning") || false;
// Maximum CPU utilization for GKE node_autoprovisioning
const gkeNodeAutoprovisioningMaxCpu: pulumi.Input<number> = config.getNumber("gkeNodeAutoprovisioningMaxCpu") || 10;
// Maximum memory utilization for GKE node_autoprovisioning
const gkeNodeAutoprovisioningMaxMemory: pulumi.Input<number> = config.getNumber("gkeNodeAutoprovisioningMaxMemory") || 100;
// Enable autoscaling for the nodepools in the GKE cluster. See https://cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler
const gkeEnableAutoscaling: pulumi.Input<boolean> = config.getBoolean("gkeEnableAutoscaling") || true;
// Maximum number of nodes for GKE nodepool autoscaling
const gkeAutoscalingMaxNodeCount: pulumi.Input<number> = config.getNumber("gkeAutoscalingMaxNodeCount") || 10;
// The IP address range of the container pods in this cluster, in CIDR notation. See https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/container_cluster#cluster_ipv4_cidr_block
const clusterIpv4CidrBlock: pulumi.Input<string> = config.get("clusterIpv4CidrBlock") || "";
// The maintenance policy to use for the cluster. See https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/container_cluster#maintenance_policy
const gkeMaintenancePolicy = config.getObject<{ recurringWindow?: { endTime?: string, recurrence?: string, startTime?: string } }>("gkeMaintenancePolicy") || {
    recurringWindow: {
        endTime: "2023-06-15T23:59:00Z",
        recurrence: "FREQ=DAILY",
        startTime: "2023-06-15T00:00:00Z",
    },
};

const genesisHelmChartPath = std.abspath({ input: "../../helm/genesis" });
const forgeHelmChartPath = std.abspath({ input: "../../helm/forge" });
const chaosMeshHelmChartPath = std.abspath({ input: "../../helm/chaos" });
const testnetAddonsHelmChartPath = std.abspath({ input: "../../helm/testnet-addons" });

const workspaceName = workspaceNameOverride != "" ? workspaceNameOverride : notImplemented("terraform.workspace");
const mychainName = chainName != "" ? chainName : pulumi.interpolate`${workspaceName}net`;
const mychainId = enableForge ? "4" : chainId;
const myzoneProject = zoneProject != "" ? zoneProject : project;
const gcpManagedZoneOutput = (new Array(zoneName != "" ? 1 : 0)).map((_, i) => i).map(__index => (gcp.dns.getManagedZoneOutput({
    name: zoneName,
    project: myzoneProject,
})));
const dnsPrefix = workspaceDns ? pulumi.interpolate`${workspaceName}.` : "";
const domain = zoneName != "" ? std.trimsuffixOutput({
    input: gcpManagedZoneOutput[0].apply(testnet => pulumi.interpolate`${dnsPrefix}${testnet.dnsName}`),
    suffix: ".",
}).apply(invoke => invoke.result) : undefined;

const gcpOrgClientConfigOutput = gcp.organizations.getClientConfigOutput({});

const validator = new AptosNodeGCP("validator", {
    clusterBootstrap: clusterBootstrap,
    manageViaPulumi: manageViaPulumi,
    project: project,
    zone: zone,
    region: region,
    zoneName: zoneName,
    zoneProject: zoneProject,
    recordName: recordName,
    workspaceDns: workspaceDns,
    createDnsRecords: createDnsRecords,
    dnsTtl: dnsTtl,
    era: era,
    chainId: chainId,
    chainName: chainName,
    imageTag: imageTag,
    validatorName: "aptos-node",
    k8sApiSources: k8sApiSources,
    clusterIpv4CidrBlock: clusterIpv4CidrBlock,
    gkeEnableNodeAutoprovisioning: gkeEnableNodeAutoprovisioning,
    gkeNodeAutoprovisioningMaxCpu: gkeNodeAutoprovisioningMaxCpu,
    gkeNodeAutoprovisioningMaxMemory: gkeNodeAutoprovisioningMaxMemory,
    gkeEnableAutoscaling: gkeEnableAutoscaling,
    gkeAutoscalingMaxNodeCount: gkeAutoscalingMaxNodeCount,
    workspaceNameOverride: workspaceNameOverride,
    helmReleaseNameOverride: enableForge ? "aptos-node" : "",
    helmValues: aptosNodeHelmValues,
    numValidators: numValidators,
    numFullnodeGroups: numFullnodeGroups,
    utilityInstanceType: utilityInstanceType,
    validatorInstanceType: validatorInstanceType,
    enableMonitoring: enableMonitoring,
    enableNodeExporter: enablePrometheusNodeExporter,
    monitoringHelmValues: monitoringHelmValues,
    gkeMaintenancePolicy: gkeMaintenancePolicy,
});

const aptosNodeHelmPrefix = enableForge ? "aptos-node" : pulumi.interpolate`${validator.helmReleaseName}-aptos-node`;

if (enableForge) {
    const helmReleaseForForge = new k8s.helm.v3.Release(`forge`, {
        name: "forge",
        chart: forgeHelmChartPath.then(path => path.result),
        maxHistory: 2,
        waitForJobs: false,
        values: {
            forge: {
                image: {
                    tag: imageTag,
                },
            },
            ...forgeHelmValues,
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                forgeHelmChartPath
            ).digest('hex') : "",
        },
    });

    const helmReleaseForTestnetAddons = new k8s.helm.v3.Release(`testnet-addons`, {
        name: "testnet-addons",
        chart: testnetAddonsHelmChartPath.then(path => path.result),
        maxHistory: 5,
        waitForJobs: false,
        values: {
            cloud: "GKE",
            imageTag: imageTag,
            genesis: {
                era: era,
                usernamePrefix: aptosNodeHelmPrefix,
                chainId: chainId,
                numValidators: numValidators,
            },
            service: {
                domain: domain,
            },
            ingress: {
                gceStaticIp: pulumi.interpolate`aptos-${workspaceName}-testnet-addons-ingress`,
                gceManagedCertificate: pulumi.interpolate`aptos-${workspaceName}-${zoneName}-testnet-addons`,
            },
            loadTest: {
                fullnodeGroups: aptosNodeHelmValues.fullnode ? aptosNodeHelmValues.fullnode.groups : [],
                config: {
                    numFullnodeGroups: numFullnodeGroups,
                },
            },
            ...testnetAddonsHelmValues,
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                testnetAddonsHelmChartPath
            ).digest('hex') : "",
        },
    });
}

const helmReleaseForGenesis = new k8s.helm.v3.Release("genesis", {
    name: "genesis",
    chart: genesisHelmChartPath.then(path => path.result),
    maxHistory: 5,
    waitForJobs: false,
    values: {
        chain: {
            name: mychainName,
            era: era,
            chainId: mychainId,
        },
        imageTag: imageTag,
        genesis: {
            numValidators: numValidators,
            usernamePrefix: aptosNodeHelmPrefix,
            domain: domain,
            validator: {
                enableOnchainDiscovery: false,
            },
            fullnode: {
                enableOnchainDiscovery: zoneName != "",
            },
        },
        ...genesisHelmValues,
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            genesisHelmChartPath
        ).digest('hex') : "",
    },
});

const k8sNamespaceForChaosMesh = new k8s.core.v1.Namespace("chaos-mesh", {
    metadata: {
        annotations: {
            name: "chaos-mesh",
        },
        name: "chaos-mesh",
    }
});

const helmReleaseForChaosMesh = new k8s.helm.v3.Release("chaos-mesh", {
    name: "chaos-mesh",
    namespace: k8sNamespaceForChaosMesh.metadata.name,
    chart: chaosMeshHelmChartPath.then(path => path.result),
    maxHistory: 5,
    waitForJobs: false,
    values: {
        "chaos-mesh": {
            chaosDaemon: {
                runtime: "containerd",
                socketPath: "/run/containerd/containerd.sock",
                image: {
                    repository: "aptos-internal/chaos-daemon",
                    tag: "latest",
                },
            },
            controllerManager: {
                image: {
                    repository: "aptos-internal/chaos-mesh",
                    tag: "latest",
                },
            },
            dashboard: {
                image: {
                    repository: "aptos-internal/chaos-dashboard",
                    tag: "latest",
                },
            },
            images: {
                registry: "us-west1-docker.pkg.dev/aptos-global",
            },
        },
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            chaosMeshHelmChartPath
        ).digest('hex') : "",
    },
});

const gcpServiceAccountForGcpIntegrations = new gcp.serviceaccount.Account("k8s-gcp-integrations", {
    project: project,
    accountId: pulumi.interpolate`${workspaceName}-testnet-gcp`,
});
const iamMemberForGcpIntegrations = new gcp.projects.IAMMember("k8s-gcp-integrations-dns", {
    project: myzoneProject,
    role: "roles/dns.admin",
    member: pulumi.interpolate`serviceAccount:${gcpServiceAccountForGcpIntegrations.email}`,
});
const iamBindingForGcpIntegrations = new gcp.serviceaccount.IAMBinding("k8s-gcp-integrations", {
    serviceAccountId: gcpServiceAccountForGcpIntegrations.name,
    role: "roles/iam.workloadIdentityUser",
    members: [
        pulumi.interpolate`serviceAccount:${validator.cluster.cluster.workloadIdentityConfig.workloadPool}[kube-system/k8s-gcp-integrations]`,
    ],
});
const k8sServiceAccountForGcpIntegrations = new k8s.core.v1.ServiceAccount("k8s-gcp-integrations", {
    metadata: {
        name: "k8s-gcp-integrations",
        namespace: "kube-system",
        annotations: {
            "iam.gke.io/gcp-service-account": gcpServiceAccountForGcpIntegrations.email,
        },
    }
});
if (zoneName) {
    const helmReleaseForExternalDns = new k8s.helm.v3.Release(`external-dns`, {
        name: "external-dns",
        repositoryOpts: {
            repo: "https://kubernetes-sigs.github.io/external-dns",
        },
        chart: "external-dns",
        version: "1.11.0",
        namespace: "kube-system",
        maxHistory: 5,
        waitForJobs: false,
        values: [JSON.stringify({
            serviceAccount: {
                create: false,
                name: k8sServiceAccountForGcpIntegrations.metadata.name,
            },
            provider: "google",
            domainFilters: zoneName != "" ? [gcpManagedZoneOutput[0].dnsName] : [],
            extraArgs: [
                `--google-project=${myzoneProject}`,
                pulumi.interpolate`--txt-owner-id=aptos-${workspaceName}`,
            ],
        })],
    });

    const gcpComputeGlobalAddressForTestnetAddonsIngress = new gcp.compute.GlobalAddress(
        `testnet-addons-ingress`, {
        project: project,
        name: pulumi.interpolate`aptos-${workspaceName}-testnet-addons-ingress`,
    });
}

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import * as std from "@pulumi/std";
import * as time from "@pulumiverse/time";
import { computeSha1ForHelmRelease } from "../../../lib/helpers"
import { getKubeconfigFromGkeCluster } from "../../../lib/gcpGkeKubeConfig"

function notImplemented(message: string) {
    throw new Error(message);
}

function singleOrNone<T>(elements: pulumi.Input<T>[]): pulumi.Input<T> {
    if (elements.length != 1) {
        throw new Error("singleOrNone expected input list to have a single element");
    }
    return elements[0];
}

const config = new pulumi.Config();
// GCP project
const project: pulumi.Input<string> = config.require("project");
// GCP region
const region: pulumi.Input<string> = config.require("region");
// GCP zone suffix
const zone: pulumi.Input<string> = config.require("zone");
// If specified, overrides the usage of Terraform workspace for naming purposes
const workspaceNameOverride: pulumi.Input<string> = config.get("workspaceNameOverride") || "";
// List of Subject Alternate Names to include in TLS certificate
const tlsSans = config.getObject<Array<string>>("tlsSans") || [];
// Include Terraform workspace name in DNS records
const workspaceDns: pulumi.Input<boolean> = config.getBoolean("workspaceDns") || true;
// DNS prefix for fullnode url
const dnsPrefixName: pulumi.Input<string> = config.get("dnsPrefixName") || "fullnode";
// Zone name of GCP Cloud DNS zone to create records in
const zoneName: pulumi.Input<string> = config.get("zoneName") || "";
// GCP project which the DNS zone is in (if different)
const zoneProject: pulumi.Input<string> = config.get("zoneProject") || "";
// Whether to create a Google Managed SSL Certificate for the GCE Ingress
const createGoogleManagedSslCertificate: pulumi.Input<boolean> = config.getBoolean("createGoogleManagedSslCertificate") || false;
// Map of values to pass to Helm
const helmValues: pulumi.Input<object> = config.getObject("helmValues") || {};
// Map of values to pass to pfn-addons Helm
const pfnHelmValues: pulumi.Input<object> = config.getObject("pfnHelmValues") || {};
// Map of values to pass to public fullnode Helm
const fullnodeHelmValues: pulumi.Input<object> = config.getObject("fullnodeHelmValues") || {};
// List of values to pass to public fullnode, for setting different value per node. length(fullnode_helm_values_list) must equal var.num_fullnodes
const fullnodeHelmValuesList: pulumi.Input<object>[] = config.getObject<pulumi.Input<object>[]>("fullnodeHelmValuesList") || [{}];
// Kubernetes namespace that the fullnode will be deployed into
const k8sNamespace: pulumi.Input<string> = config.get("k8sNamespace") || "aptos";
// List of CIDR subnets which can access the Kubernetes API endpoint
const k8sApiSources: pulumi.Input<object> = config.getObject("k8sApiSources") || ["0.0.0.0/0"];
// Number of fullnodes
const numFullnodes: pulumi.Input<number> = config.getNumber("numFullnodes") || 1;
// Number of extra instances to add into node pool
const numExtraInstance: pulumi.Input<number> = config.getNumber("numExtraInstance") || 0;
// Disk size for fullnode instance
const instanceDiskSizeGb: pulumi.Input<number> = config.getNumber("instanceDiskSizeGb") || 100;
// Docker image tag to use for the fullnode
const imageTag: pulumi.Input<string> = config.get("imageTag") || "devnet";
// Chain era, used to start a clean chain
const era: pulumi.Input<number> = config.getNumber("era") || 1;
// aptos chain ID
const chainId: pulumi.Input<string> = config.get("chainId") || "DEVNET";
// Aptos chain name
const chainName: pulumi.Input<string> = config.get("chainName") || "devnet";
// Name of the fullnode node owner
const fullnodeName: pulumi.Input<string> = config.require("fullnodeName");
// Machine type for running fullnode
const machineType: pulumi.Input<string> = config.get("machineType") || "n2-standard-32";
// enable data backup from fullnode
const enableBackup: pulumi.Input<boolean> = config.getBoolean("enableBackup") || false;
// provide data backups to the public
const enablePublicBackup: pulumi.Input<boolean> = config.getBoolean("enablePublicBackup") || false;
// index of fullnode to backup data from
const backupFullnodeIndex: pulumi.Input<number> = config.getNumber("backupFullnodeIndex") || 0;
// Enable monitoring helm chart
const enableMonitoring: pulumi.Input<boolean> = config.getBoolean("enableMonitoring") || false;
// Map of values to pass to monitoring Helm
const monitoringHelmValues: pulumi.Input<object> = config.getObject("monitoringHelmValues") || {};
// Enable prometheus-node-exporter within monitoring helm chart
const enablePrometheusNodeExporter: pulumi.Input<boolean> = config.getBoolean("enablePrometheusNodeExporter") || false;
// Enable kube-state-metrics within monitoring helm chart
const enableKubeStateMetrics: pulumi.Input<boolean> = config.getBoolean("enableKubeStateMetrics") || false;
// Enable private nodes for GKE cluster
const gkeEnablePrivateNodes: pulumi.Input<boolean> = config.getBoolean("gkeEnablePrivateNodes") || true;
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


// Whether to manage the aptos-node k8s workload via Terraform. If set to false, the helm_release resource will still be created and updated when values change, but it may not be updated on every apply
const manageViaPulumi: pulumi.Input<boolean> = config.getBoolean("manageViaPulumi") || true;
const myzoneProject = zoneProject != "" ? zoneProject : project;

const fullnodeHelmChartPath = std.abspath({ input: "../../helm/fullnode" });
const pfnAddonsHelmChartPath = std.abspath({ input: "../../helm/pfn-addons" });
const monitoringHelmChartPath = std.abspath({ input: "../../helm/monitoring" });

const gcpServiceAccountForGke = new gcp.serviceaccount.Account("gke", { accountId: `aptos-${workspaceName}-gke` });

const gcpIamMemberForGkeLogging = new gcp.projects.IAMMember("gke-logging", {
    project: project,
    role: "roles/logging.logWriter",
    member: pulumi.interpolate`serviceAccount:${gcpServiceAccountForGke.email}`,
});
const gcpIamMemberForGkeMetrics = new gcp.projects.IAMMember("gke-metrics", {
    project: project,
    role: "roles/monitoring.metricWriter",
    member: pulumi.interpolate`serviceAccount:${gcpServiceAccountForGke.email}`,
});
const gcpIamMemberForGkeMonitoring = new gcp.projects.IAMMember("gke-monitoring", {
    project: project,
    role: "roles/monitoring.viewer",
    member: pulumi.interpolate`serviceAccount:${gcpServiceAccountForGke.email}`,
});
const randomIdForK8sDebugger = new random.RandomId("k8s-debugger-id", { byteLength: 4 });
const gcpIamCustomRoleForK8sDebugger = new gcp.projects.IAMCustomRole("k8s-debugger", {
    roleId: pulumi.interpolate`container.debugger.${randomIdForK8sDebugger.hex}`,
    title: "Kubernetes Engine Debugger",
    description: "Additional permissions to debug Kubernetes Engine workloads",
    permissions: [
        "container.pods.exec",
        "container.pods.portForward",
    ],
});
const gcpOrganizationsClientConfigOutput = gcp.organizations.getClientConfigOutput({});
const myzone = `${region}-${zone}`;
const workspaceName = workspaceNameOverride == "" ? pulumi.getStack() : workspaceNameOverride;
const gcpProjectServicesToEnable: gcp.projects.Service[] = [];
for (const range of Object.entries({
    "clouderrorreporting.googleapis.com": true,
    "cloudresourcemanager.googleapis.com": true,
    "compute.googleapis.com": true,
    "container.googleapis.com": true,
    "iam.googleapis.com": true,
    "logging.googleapis.com": true,
    "monitoring.googleapis.com": true,
}).map(([k, v]) => ({ key: k, value: v }))) {
    gcpProjectServicesToEnable.push(new gcp.projects.Service(`services-${range.key}`, {
        service: range.key,
        disableOnDestroy: false,
    }));
}
const gcpNetworkForAptos = new gcp.compute.Network("aptos", {
    name: `aptos-${workspaceName}`,
    autoCreateSubnetworks: true,
});
// If the google_compute_subnetwork data source resolves immediately after the
// network is created, it doesn't find the subnet and returns null. This results
// in the vault-lb address being created in the default network.
const sleepForCreateSubnetworks = new time.Sleep("create-subnetworks", { createDuration: "30s" });
const gcpSubnetworkOutputForAptos = gcp.compute.getSubnetworkOutput({
    name: gcpNetworkForAptos.name,
});
const gcpRouterForNat = new gcp.compute.Router("nat", {
    name: `aptos-${workspaceName}-nat`,
    network: gcpNetworkForAptos.id,
});
if (gkeEnablePrivateNodes) {
    const gcpAddressForNat = new gcp.compute.Address(
        `nat`, { name: `aptos-${workspaceName}-nat` }
    );
    const gcpRouterNatForNat = new gcp.compute.RouterNat(`nat`, {
        name: `aptos-${workspaceName}-nat`,
        router: gcpRouterForNat.name,
        natIpAllocateOption: "MANUAL_ONLY",
        natIps: [gcpAddressForNat.selfLink],
        sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_PRIMARY_IP_RANGES",
    });
}

const aptos = new gcp.container.Cluster("aptos", {
    name: `aptos-${workspaceName}`,
    location: myzone,
    network: gcpNetworkForAptos.id,
    removeDefaultNodePool: true,
    initialNodeCount: 1,
    loggingService: "logging.googleapis.com/kubernetes",
    monitoringService: "monitoring.googleapis.com/kubernetes",
    releaseChannel: {
        channel: "REGULAR",
    },
    masterAuth: {
        clientCertificateConfig: {
            issueClientCertificate: false,
        },
    },
    masterAuthorizedNetworksConfig: {
        cidrBlocks: Object.entries(k8sApiSources).map(([k, v]) => ({ key: k, value: v })).map(entry => ({
            cidrBlock: entry.value,
        })),
    },
    privateClusterConfig: {
        enablePrivateNodes: gkeEnablePrivateNodes,
        enablePrivateEndpoint: false,
        masterIpv4CidrBlock: "172.16.0.0/28",
    },
    ipAllocationPolicy: {
        clusterIpv4CidrBlock: "",
    },
    workloadIdentityConfig: {
        workloadPool: `${project}.svc.id.goog`,
    },
    addonsConfig: {
        networkPolicyConfig: {
            disabled: false,
        },
    },
    networkPolicy: {
        enabled: false,
    },
    clusterAutoscaling: {
        resourceLimits: Object.entries(gkeEnableNodeAutoprovisioning ? {
            cpu: gkeNodeAutoprovisioningMaxCpu,
            memory: gkeNodeAutoprovisioningMaxMemory,
        } : {}).map(([k, v]) => ({ key: k, value: v })).map(entry => ({
            resourceType: entry.key,
            minimum: 1,
            maximum: entry.value,
        })),
        enabled: gkeEnableNodeAutoprovisioning,
        autoProvisioningDefaults: {
            oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
            serviceAccount: gcpServiceAccountForGke.email,
        },
    },
});

const k8sProvider = getKubeconfigFromGkeCluster({ GkeCluster: aptos });

const gcpNodePoolForFullnodes = new gcp.container.NodePool("fullnodes", {
    autoscaling: singleOrNone((gkeEnableAutoscaling ? [1] : []).map((v, k) => ({ key: k, value: v })).map(entry => ({
        minNodeCount: 1,
        maxNodeCount: gkeAutoscalingMaxNodeCount,
    }))),
    name: "fullnodes",
    location: myzone,
    cluster: aptos.name,
    nodeCount: gkeEnableAutoscaling ? undefined : numFullnodes + numExtraInstance,
    nodeConfig: {
        machineType: machineType,
        imageType: "COS_CONTAINERD",
        diskSizeGb: instanceDiskSizeGb,
        serviceAccount: gcpServiceAccountForGke.email,
        tags: ["fullnodes"],
        shieldedInstanceConfig: {
            enableSecureBoot: true,
        },
        workloadMetadataConfig: {
            mode: "GKE_METADATA",
        },
    },
});
const gcpServiceAccountAccountForK8sIntegration = new gcp.serviceaccount.Account("k8s-gcp-integrations", { accountId: `${workspaceName}-pfn-gcp` });
const gcpIamMemberForK8sIntegration = new gcp.projects.IAMMember("k8s-gcp-integrations-dns", {
    project: myzoneProject,
    role: "roles/dns.admin",
    member: pulumi.interpolate`serviceAccount:${gcpServiceAccountAccountForK8sIntegration.email}`,
});
const gcpServiceAccountIamBindingForK8sIntegration = new gcp.serviceaccount.IAMBinding("k8s-gcp-integrations", {
    serviceAccountId: gcpServiceAccountAccountForK8sIntegration.name,
    role: "roles/iam.workloadIdentityUser",
    members: [aptos.workloadIdentityConfig.apply(workloadIdentityConfig => `serviceAccount:${workloadIdentityConfig.workloadPool}[kube-system/k8s-gcp-integrations]`)],
});
const k8sServiceAccountForK8sIntegration = new k8s.core.v1.ServiceAccount("k8s-gcp-integrations", {
    metadata: {
        name: "k8s-gcp-integrations",
        namespace: "kube-system",
        annotations: {
            "iam.gke.io/gcp-service-account": gcpServiceAccountAccountForK8sIntegration.email,
        },
    }
});
if (zoneName) {
    const managedZoneOutputForPfn = (new Array(zoneName != "" ? 1 : 0)).map((_, i) => i).map(__index => (gcp.dns.getManagedZoneOutput({
        name: zoneName,
        project: myzoneProject,
    })));
    const dnsPrefix = workspaceDns ? `${workspaceName}.${dnsPrefixName}.` : `${dnsPrefixName}.`;
    const domain = zoneName != "" ? std.trimsuffixOutput({
        input: managedZoneOutputForPfn[0].apply(pfn => `${dnsPrefix}${pfn.dnsName}`),
        suffix: ".",
    }).apply(invoke => invoke.result) : undefined;
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
        values: {
            serviceAccount: {
                create: false,
                name: k8sServiceAccountForK8sIntegration.metadata.name,
            },
            provider: "google",
            domainFilters: zoneName != "" ? [managedZoneOutputForPfn[0].dnsName] : [],
            extraArgs: [
                `--google-project=${myzoneProject}`,
                `--txt-owner-id=${workspaceName}`,
                "--txt-prefix=aptos",
            ],
        },
    });
}

const randomIdForBackupBucket = new random.RandomId("backup-bucket", { byteLength: 4 });
const gcpBucketForBackup = new gcp.storage.Bucket("backup", {
    name: pulumi.interpolate`aptos-${workspaceName}-backup-${randomIdForBackupBucket.hex}`,
    location: region,
    uniformBucketLevelAccess: true,
});
const gcpServiceAccountAccountForBackup = new gcp.serviceaccount.Account("backup", { accountId: `aptos-${workspaceName}-backup` });
const gcpBucketIamMemberForBackup = new gcp.storage.BucketIAMMember("backup", {
    bucket: gcpBucketForBackup.name,
    role: "roles/storage.objectAdmin",
    member: pulumi.interpolate`serviceAccount:${gcpServiceAccountAccountForBackup.email}`,
});
const gcpIamBindingForBackup = new gcp.serviceaccount.IAMBinding("backup", {
    serviceAccountId: gcpServiceAccountAccountForBackup.name,
    role: "roles/iam.workloadIdentityUser",
    members: pulumi.all([std.rangeOutput({
        limit: numFullnodes,
    }), aptos.workloadIdentityConfig]).apply(([invoke, workloadIdentityConfig]) => .map(i => (`serviceAccount:${workloadIdentityConfig.workloadPool}[${k8sNamespace}/pfn${i}-aptos-fullnode]`))),
});
// backup public access
const gcpBucketIamMemberForPublic = new gcp.storage.BucketIAMMember("public", {
    bucket: gcpBucketForBackup.name,
    role: "roles/storage.objectViewer",
    member: "allUsers",
});
const k8sNamespaceForAptos = new k8s.core.v1.Namespace("aptos", {
    metadata: {
        name: k8sNamespace,
    }
});

// TODO: fix this
// namespaces.forEach((namespace, index) => {
//     new k8s.rbac.v1.RoleBinding(`disable-psp-${index}`, {
//         metadata: {
//             name: "privileged-psp",
//             namespace: namespace,
//         },
//         roleRef: {
//             apiGroup: "rbac.authorization.k8s.io",
//             kind: "ClusterRole",
//             name: "gce:podsecuritypolicy:privileged",
//         },
//         subjects: [{
//             apiGroup: "rbac.authorization.k8s.io",
//             kind: "Group",
//             name: `system:serviceaccounts:${namespace}`,
//         }],
//     });
// });

const helmReleaseForPfnAddons = new k8s.helm.v3.Release("pfn-addons", {
    name: "pfn-addons",
    chart: pfnAddonsHelmChartPath.then(path => path.result),
    maxHistory: 10,
    waitForJobs: false,
    namespace: k8sNamespace,
    values: {
        service: {
            domain: domain,
        },
        ingress: {
            "class": "gce",
            gceManagedCertificate: createGoogleManagedSslCertificate ? `aptos-${workspaceName}-ingress` : undefined,
            gceManagedCertificateDomains: createGoogleManagedSslCertificate ? std.joinOutput({
                separator: ",",
                input: std.concatOutput({
                    input: [
                            .map(x => (`pfn${x}.${domain}`)),
                        [domain],
                        tlsSans,
                    ],
                }).result,
            }).result : "",
        },
        ...pfnHelmValues,
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            pfnAddonsHelmChartPath
        ).digest('hex') : "",
    },
});

const k8sStorageClassForSsd = new k8s.storage.v1.StorageClass("ssd", {
    metadata: { name: "ssd" },
    provisioner: "kubernetes.io/gce-pd",
    volumeBindingMode: "WaitForFirstConsumer",
    parameters: { type: "pd-ssd" },
});

const helmReleaseForFullnode: k8s.helm.v3.Release[] = [];
for (const range = { value: 0 }; range.value < numFullnodes; range.value++) {
    helmReleaseForFullnode.push(new k8s.helm.v3.Release(`fullnode-${range.value}`, {
        name: `pfn${range.value}`,
        chart: fullnodeHelmChartPath.then(path => path.result),
        maxHistory: 10,
        waitForJobs: false,
        namespace: k8sNamespace,
        createNamespace: true,
        values: {
            imageTag: imageTag,
            manageImages: manageViaPulumi,
            chain: {
                era: era,
                name: chainName,
            },
            image: {
                tag: imageTag,
            },
            nodeSelector: gkeEnableNodeAutoprovisioning ? {} : {
                "cloud.google.com/gke-nodepool": "fullnodes",
                "iam.gke.io/gke-metadata-server-enabled": "true",
            },
            storage: {
                class: k8sStorageClassForSsd,
            },
            service: {
                type: "LoadBalancer",
                annotations: {
                    "external-dns.alpha.kubernetes.io/hostname": zoneName != "" ? `pfn${range.value}.${domain}` : "",
                },
            },
            backup: {
                enable: range.value == backupFullnodeIndex ? enableBackup : false,
                config: {
                    location: "gcs",
                    gcs: {
                        bucket: gcpBucketForBackup.name,
                    },
                },
            },
            restore: {
                config: {
                    location: "gcs",
                    gcs: {
                        bucket: gcpBucketForBackup.name,
                    },
                },
            },
            serviceAccount: {
                annotations: {
                    "iam.gke.io/gcp-service-account": gcpServiceAccountAccountForBackup.email,
                },
            },
            ...fullnodeHelmValues,
            ...fullnodeHelmValuesList.length === 0 ? {} : fullnodeHelmValuesList[range.value],
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                fullnodeHelmChartPath
            ).digest('hex') : "",
        },
    }));
}

const helmReleaseForMonitoring = new k8s.helm.v3.Release(`monitoring`, {
    name: "aptos-monitoring",
    chart: monitoringHelmChartPath.then(path => path.result),
    maxHistory: 5,
    waitForJobs: false,
    namespace: k8sNamespace,
    values: {
        chain: {
            name: chainName,
        },
        fullnode: {
            name: fullnodeName,
        },
        service: {
            domain: zoneName != "" ? std.trimsuffixOutput({
                input: domain,
                suffix: ".",
            }).result : "",
        },
        "kube-state-metrics": {
            enabled: enableKubeStateMetrics,
        },
        "prometheus-node-exporter": {
            enabled: enablePrometheusNodeExporter,
        },
        monitoring: {
            prometheus: {
                storage: {
                    "class": "standard",
                },
            },
        },
        ...monitoringHelmValues,
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            monitoringHelmChartPath
        ).digest('hex') : "",
    },
});

const k8sAllNamespaces = k8s.index.allNamespaces({});
const kubernetesMasterVersion = std.substrOutput({
    input: aptos.masterVersion,
    length: 0,
    offset: 4,
}).apply(invoke => invoke.result);
const baselinePssLabels = {
    "pod-security.kubernetes.io/audit": "baseline",
    "pod-security.kubernetes.io/warn": "baseline",
    "pod-security.kubernetes.io/enforce": "privileged",
};
//   subject {
//     api_group = "rbac.authorization.k8s.io"
//     kind      = "Group"
//     name      = "system:serviceaccounts:${each.value}"
//   }
// }
const k8sNamespaceForPssDefault = new k8s.core.v1.Namespace("pss-default", {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
        name: "default",
        labels: baselinePssLabels,
    },
});

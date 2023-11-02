import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as helm from "@pulumi/helm";
import * as kubernetes from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import * as std from "@pulumi/std";
import * as time from "@pulumi/time";

function notImplemented(message: string) {
    throw new Error(message);
}

function singleOrNone<T>(elements: pulumi.Input<T>[]): pulumi.Input<T> {
    if (elements.length != 1) {
        throw new Error("singleOrNone expected input list to have a single element");
    }
    return elements[0];
}

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
    manageViaTf?: pulumi.Input<boolean>,
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

export class Gcp extends pulumi.ComponentResource {
    public validatorEndpoint: pulumi.Output<any>;
    public fullnodeEndpoint: pulumi.Output<any>;
    public helmReleaseName: pulumi.Output<any>;
    public gkeClusterEndpoint: pulumi.Output<string>;
    public gkeClusterCaCertificate: pulumi.Output<string>;
    public gkeClusterWorkloadIdentityConfig: pulumi.Output<any>;
    constructor(name: string, args: GcpArgs, opts?: pulumi.ComponentResourceOptions) {
        super("components:index:Gcp", name, args, opts);
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
        args.manageViaTf = args.manageViaTf || true;
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
        const privilegedPssLabels = {
            "pod-security.kubernetes.io/audit": "baseline",
            "pod-security.kubernetes.io/warn": "baseline",
            "pod-security.kubernetes.io/enforce": "privileged",
        };

        const pss_default = new kubernetes.index.Labels(`${name}-pss-default`, {
            apiVersion: "v1",
            kind: "Namespace",
            metadata: [{
                name: "default",
            }],
            labels: privilegedPssLabels,
        }, {
            parent: this,
        });

        const provider = gcp.organizations.getClientConfigOutput({});

        const myzone = `${args.region}-${args.zone}`;

        const workspaceName = args.workspaceNameOverride == "" ? notImplemented("terraform.workspace") : args.workspaceNameOverride;

        const services: gcp.projects.Service[] = [];
        for (const range of Object.entries({
            "clouderrorreporting.googleapis.com": true,
            "cloudkms.googleapis.com": true,
            "cloudresourcemanager.googleapis.com": true,
            "compute.googleapis.com": true,
            "container.googleapis.com": true,
            "iam.googleapis.com": true,
            "logging.googleapis.com": true,
            "monitoring.googleapis.com": true,
            "secretmanager.googleapis.com": true,
            "spanner.googleapis.com": true,
        }).map(([k, v]) => ({key: k, value: v}))) {
            services.push(new gcp.projects.Service(`${name}-services-${range.key}`, {
                service: range.key,
                disableOnDestroy: false,
            }, {
            parent: this,
        }));
        }

        const gke = new gcp.serviceaccount.Account(`${name}-gke`, {accountId: `aptos-${workspaceName}-gke`}, {
            parent: this,
        });

        const gke_logging = new gcp.projects.IAMMember(`${name}-gke-logging`, {
            project: args.project,
            role: "roles/logging.logWriter",
            member: pulumi.interpolate`serviceAccount:${gke.email}`,
        }, {
            parent: this,
        });

        const gke_metrics = new gcp.projects.IAMMember(`${name}-gke-metrics`, {
            project: args.project,
            role: "roles/monitoring.metricWriter",
            member: pulumi.interpolate`serviceAccount:${gke.email}`,
        }, {
            parent: this,
        });

        const gke_monitoring = new gcp.projects.IAMMember(`${name}-gke-monitoring`, {
            project: args.project,
            role: "roles/monitoring.viewer",
            member: pulumi.interpolate`serviceAccount:${gke.email}`,
        }, {
            parent: this,
        });

        const k8s_debugger_id = new random.RandomId(`${name}-k8s-debugger-id`, {byteLength: 4}, {
            parent: this,
        });

        const k8s_debugger = new gcp.projects.IAMCustomRole(`${name}-k8s-debugger`, {
            roleId: pulumi.interpolate`container.debugger.${k8s_debugger_id.hex}`,
            title: "Kubernetes Engine Debugger",
            description: "Additional permissions to debug Kubernetes Engine workloads",
            permissions: [
                "container.pods.exec",
                "container.pods.portForward",
            ],
        }, {
            parent: this,
        });

        const lbCreation = new time.Sleep(`${name}-lb_creation`, {createDuration: "1m"}, {
            parent: this,
        });

        const validator_dns = new random.RandomString(`${name}-validator-dns`, {
            upper: false,
            special: false,
            length: 16,
        }, {
            parent: this,
        });

        const dnsPrefix = args.workspaceDns ? `${workspaceName}.` : "";

        const myrecordName = notImplemented("replace(var.record_name,\"<workspace>\",local.workspace_name)");

        const aptos = (new Array(args.zoneName != "" ? 1 : 0)).map((_, i) => i).map(__index => (gcp.dns.getManagedZoneOutput({
            name: args.zoneName,
            project: args.zoneProject != "" ? args.zoneProject : args.project,
        })));

        const domain = args.zoneName != "" ? aptos[0].apply(apto => `${dnsPrefix}${apto.dnsName}`) : undefined;

        const validator-lb = (new Array(args.zoneName != "" && args.createDnsRecords ? 1 : 0)).map((_, i) => i).map(__index => (kubernetes.index.service({
            metadata: [{
                name: `${workspaceName}-aptos-node-0-validator-lb`,
            }],
        })));

        const fullnode-lb = (new Array(args.zoneName != "" && args.createDnsRecords ? 1 : 0)).map((_, i) => i).map(__index => (kubernetes.index.service({
            metadata: [{
                name: `${workspaceName}-aptos-node-0-fullnode-lb`,
            }],
        })));

        const validator: gcp.dns.RecordSet[] = [];
        for (const range = {value: 0}; range.value < (args.zoneName != "" && args.createDnsRecords ? 1 : 0); range.value++) {
            validator.push(new gcp.dns.RecordSet(`${name}-validator-${range.value}`, {
                managedZone: aptos[0].apply(apto => apto.name),
                project: aptos[0].apply(apto => apto.project),
                name: pulumi.all([validator_dns.result, aptos[0]]).apply(([result, apto]) => `${result}.${myrecordName}.${apto.dnsName}`),
                type: "A",
                ttl: args.dnsTtl,
                rrdatas: [validator_lb[0].status[0].loadBalancer[0].ingress[0].ip],
            }, {
            parent: this,
        }));
        }

        const fullnode: gcp.dns.RecordSet[] = [];
        for (const range = {value: 0}; range.value < (args.zoneName != "" && args.createDnsRecords ? 1 : 0); range.value++) {
            fullnode.push(new gcp.dns.RecordSet(`${name}-fullnode-${range.value}`, {
                managedZone: aptos[0].apply(apto => apto.name),
                project: aptos[0].apply(apto => apto.project),
                name: aptos[0].apply(apto => `${myrecordName}.${apto.dnsName}`),
                type: "A",
                ttl: args.dnsTtl,
                rrdatas: [fullnode_lb[0].status[0].loadBalancer[0].ingress[0].ip],
            }, {
            parent: this,
        }));
        }

        const aptosResource2 = new gcp.compute.Network(`${name}-aptos`, {
            name: `aptos-${workspaceName}`,
            autoCreateSubnetworks: true,
        }, {
            parent: this,
        });

        // If the google_compute_subnetwork data source resolves immediately after the
        // network is created, it doesn't find the subnet and returns null. This results
        // in the vault-lb address being created in the default network.
        const create_subnetworks = new time.Sleep(`${name}-create-subnetworks`, {createDuration: "30s"}, {
            parent: this,
        });

        const regionData = gcp.compute.getSubnetworkOutput({
            name: aptosResource2.name,
        });

        const nat = new gcp.compute.Router(`${name}-nat`, {
            name: `aptos-${workspaceName}-nat`,
            network: aptosResource2.id,
        }, {
            parent: this,
        });

        const natResource = new gcp.compute.Address(`${name}-nat`, {name: `aptos-${workspaceName}-nat`}, {
            parent: this,
        });

        const natResource2 = new gcp.compute.RouterNat(`${name}-nat`, {
            name: `aptos-${workspaceName}-nat`,
            router: nat.name,
            natIpAllocateOption: "MANUAL_ONLY",
            natIps: [natResource.selfLink],
            sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_PRIMARY_IP_RANGES",
        }, {
            parent: this,
        });

        const aptosResource = new gcp.container.Cluster(`${name}-aptos`, {
            name: `aptos-${workspaceName}`,
            location: myzone,
            network: aptosResource2.id,
            removeDefaultNodePool: true,
            initialNodeCount: 1,
            loggingService: "logging.googleapis.com/kubernetes",
            monitoringService: "monitoring.googleapis.com/kubernetes",
            releaseChannel: {
                channel: "REGULAR",
            },
            podSecurityPolicyConfig: {
                enabled: false,
            },
            masterAuth: {
                clientCertificateConfig: {
                    issueClientCertificate: false,
                },
            },
            masterAuthorizedNetworksConfig: {
                cidrBlocks: Object.entries(args.k8sApiSources).map(([k, v]) => ({key: k, value: v})).map(entry => ({
                    cidrBlock: entry.value,
                })),
            },
            privateClusterConfig: {
                enablePrivateNodes: true,
                enablePrivateEndpoint: false,
                masterIpv4CidrBlock: "172.16.0.0/28",
            },
            ipAllocationPolicy: {
                clusterIpv4CidrBlock: args.clusterIpv4CidrBlock,
            },
            workloadIdentityConfig: {
                workloadPool: `${args.project}.svc.id.goog`,
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
                resourceLimits: Object.entries(args.gkeEnableNodeAutoprovisioning ? {
                    cpu: args.gkeNodeAutoprovisioningMaxCpu,
                    memory: args.gkeNodeAutoprovisioningMaxMemory,
                } : {}).map(([k, v]) => ({key: k, value: v})).map(entry => ({
                    resourceType: entry.key,
                    minimum: 1,
                    maximum: entry.value,
                })),
                enabled: args.gkeEnableNodeAutoprovisioning,
            },
            maintenancePolicy: {
                recurringWindow: singleOrNone((args.gkeMaintenancePolicy.recurringWindow != undefined ? [1] : []).map((v, k) => ({key: k, value: v})).map(entry => ({
                    startTime: args.gkeMaintenancePolicy.recurringWindow?.startTime,
                    endTime: args.gkeMaintenancePolicy.recurringWindow?.endTime,
                    recurrence: args.gkeMaintenancePolicy.recurringWindow?.recurrence,
                }))),
            },
        }, {
            parent: this,
        });

        const utilities = new gcp.container.NodePool(`${name}-utilities`, {
            autoscaling: singleOrNone((args.gkeEnableAutoscaling ? [1] : []).map((v, k) => ({key: k, value: v})).map(entry => ({
                minNodeCount: 1,
                maxNodeCount: args.gkeAutoscalingMaxNodeCount,
            }))),
            name: "utilities",
            location: myzone,
            cluster: aptosResource.name,
            nodeCount: args.gkeEnableAutoscaling ? undefined : args.gkeEnableNodeAutoprovisioning ? 0 : notImplemented("lookup(var.node_pool_sizes,\"utilities\",var.utility_instance_num)"),
            nodeConfig: {
                taints: (args.utilityInstanceEnableTaint ? ["utilities"] : []).map((v, k) => ({key: k, value: v})).map(entry => ({
                    key: "aptos.org/nodepool",
                    value: entry.value,
                    effect: "NO_EXECUTE",
                })),
                machineType: args.utilityInstanceType,
                imageType: "COS_CONTAINERD",
                diskSizeGb: args.utilityInstanceDiskSizeGb,
                serviceAccount: gke.email,
                tags: ["utilities"],
                oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                },
                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },
            },
        }, {
            parent: this,
        });

        const validators = new gcp.container.NodePool(`${name}-validators`, {
            autoscaling: singleOrNone((args.gkeEnableAutoscaling ? [1] : []).map((v, k) => ({key: k, value: v})).map(entry => ({
                minNodeCount: 1,
                maxNodeCount: args.gkeAutoscalingMaxNodeCount,
            }))),
            name: "validators",
            location: myzone,
            cluster: aptosResource.name,
            nodeCount: args.gkeEnableAutoscaling ? undefined : args.gkeEnableNodeAutoprovisioning ? 0 : notImplemented("lookup(var.node_pool_sizes,\"validators\",var.validator_instance_num)"),
            nodeConfig: {
                taints: (args.validatorInstanceEnableTaint ? ["validators"] : []).map((v, k) => ({key: k, value: v})).map(entry => ({
                    key: "aptos.org/nodepool",
                    value: entry.value,
                    effect: "NO_EXECUTE",
                })),
                machineType: args.validatorInstanceType,
                imageType: "COS_CONTAINERD",
                diskSizeGb: args.validatorInstanceDiskSizeGb,
                serviceAccount: gke.email,
                tags: ["validators"],
                oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                },
                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },
            },
        }, {
            parent: this,
        });

        const ssd = new kubernetes.storage.v1.StorageClass(`${name}-ssd`, {
            metadata: {
                name: "ssd",
            },
            storageProvisioner: "kubernetes.io/gce-pd",
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: {
                type: "pd-ssd",
            },
        }, {
            parent: this,
        });

        const monitoringHelmChartPath = `${notImplemented("path.module")}/../../helm/monitoring`;

        const loggerHelmChartPath = `${notImplemented("path.module")}/../../helm/logger`;

        const aptosNodeHelmChartPath = args.helmChart != "" ? args.helmChart : `${notImplemented("path.module")}/../../helm/aptos-node`;

        const helmReleaseName = args.helmReleaseNameOverride != "" ? args.helmReleaseNameOverride : workspaceName;

        const validatorResource = new helm.index.Release(`${name}-validator`, {
            set: Object.entries(args.manageViaTf ? notImplemented("toset([\"\"])") : notImplemented("toset([])")).map(([k, v]) => ({key: k, value: v})).map(entry => ({
                name: "chart_sha1",
                value: std.sha1Output({
                    input: std.joinOutput({
                        separator: "",
                        input: .map(f => (std.filesha1Output({
                            input: `${aptosNodeHelmChartPath}/${f}`,
                        }).result)),
                    }).result,
                }).result,
            })),
            name: helmReleaseName,
            chart: aptosNodeHelmChartPath,
            maxHistory: 5,
            wait: false,
            values: [
                JSON.stringify({
                    numValidators: args.numValidators,
                    numFullnodeGroups: args.numFullnodeGroups,
                    imageTag: args.imageTag,
                    manageImages: args.manageViaTf,
                    chain: {
                        era: args.era,
                        chainId: args.chainId,
                        name: args.chainName,
                    },
                    validator: {
                        name: args.validatorName,
                        storage: {
                            "class": ssd.metadata.name,
                        },
                        nodeSelector: args.gkeEnableNodeAutoprovisioning ? {} : {
                            "cloud.google.com/gke-nodepool": validators.name,
                        },
                        tolerations: [{
                            key: "aptos.org/nodepool",
                            value: "validators",
                            effect: "NoExecute",
                        }],
                    },
                    fullnode: {
                        storage: {
                            "class": ssd.metadata.name,
                        },
                        nodeSelector: args.gkeEnableNodeAutoprovisioning ? {} : {
                            "cloud.google.com/gke-nodepool": validators.name,
                        },
                        tolerations: [{
                            key: "aptos.org/nodepool",
                            value: "validators",
                            effect: "NoExecute",
                        }],
                    },
                    haproxy: {
                        nodeSelector: args.gkeEnableNodeAutoprovisioning ? {} : {
                            "cloud.google.com/gke-nodepool": utilities.name,
                        },
                    },
                    service: {
                        domain: domain,
                    },
                }),
                args.helmValuesFile != "" ? std.fileOutput({
                    input: args.helmValuesFile,
                }).result : "{}",
                JSON.stringify(args.helmValues),
            ],
        }, {
            parent: this,
        });

        const logger: helm.index.Release[] = [];
        for (const range = {value: 0}; range.value < (args.enableLogger ? 1 : 0); range.value++) {
            logger.push(new helm.index.Release(`${name}-logger-${range.value}`, {
                name: `${helmReleaseName}-log`,
                chart: loggerHelmChartPath,
                maxHistory: 10,
                wait: false,
                values: [
                    JSON.stringify({
                        logger: {
                            name: "aptos-logger",
                        },
                        chain: {
                            name: args.chainName,
                        },
                        serviceAccount: {
                            create: false,
                            name: helmReleaseName == "aptos-node" ? "aptos-node-validator" : `${helmReleaseName}-aptos-node-validator`,
                        },
                    }),
                    JSON.stringify(args.loggerHelmValues),
                ],
                set: [{
                    name: "chart_sha1",
                    value: std.sha1Output({
                        input: std.joinOutput({
                            separator: "",
                            input: .map(f => (std.filesha1Output({
                                input: `${loggerHelmChartPath}/${f}`,
                            }).result)),
                        }).result,
                    }).result,
                }],
            }, {
            parent: this,
        }));
        }

        const monitoring: helm.index.Release[] = [];
        for (const range = {value: 0}; range.value < (args.enableMonitoring ? 1 : 0); range.value++) {
            monitoring.push(new helm.index.Release(`${name}-monitoring-${range.value}`, {
                name: `${helmReleaseName}-mon`,
                chart: monitoringHelmChartPath,
                maxHistory: 10,
                wait: false,
                values: [
                    JSON.stringify({
                        chain: {
                            name: args.chainName,
                        },
                        validator: {
                            name: args.validatorName,
                        },
                        monitoring: {
                            prometheus: {
                                storage: {
                                    "class": ssd.metadata.name,
                                },
                            },
                        },
                    }),
                    JSON.stringify(args.monitoringHelmValues),
                ],
                set: [{
                    name: "chart_sha1",
                    value: std.sha1Output({
                        input: std.joinOutput({
                            separator: "",
                            input: .map(f => (std.filesha1Output({
                                input: `${monitoringHelmChartPath}/${f}`,
                            }).result)),
                        }).result,
                    }).result,
                }],
            }, {
            parent: this,
        }));
        }

        const nodeExporter: helm.index.Release[] = [];
        for (const range = {value: 0}; range.value < (args.enableNodeExporter ? 1 : 0); range.value++) {
            nodeExporter.push(new helm.index.Release(`${name}-node_exporter-${range.value}`, {
                name: "prometheus-node-exporter",
                repository: "https://prometheus-community.github.io/helm-charts",
                chart: "prometheus-node-exporter",
                version: "4.0.0",
                namespace: "kube-system",
                maxHistory: 5,
                wait: false,
                values: [
                    JSON.stringify({}),
                    JSON.stringify(args.nodeExporterHelmValues),
                ],
            }, {
            parent: this,
        }));
        }

        this.validatorEndpoint = args.zoneName != "" && args.createDnsRecords ? std.trimsuffixOutput({
            input: validator[0].name,
            suffix: ".",
        }).apply(invoke => `/dns4/${invoke.result}/tcp/${validator_lb[0].spec[0].port[0].port}`) : undefined;
        this.fullnodeEndpoint = args.zoneName != "" && args.createDnsRecords ? std.trimsuffixOutput({
            input: fullnode[0].name,
            suffix: ".",
        }).apply(invoke => `/dns4/${invoke.result}/tcp/${fullnode_lb[0].spec[0].port[0].port}`) : undefined;
        this.helmReleaseName = validatorResource.name;
        this.gkeClusterEndpoint = aptosResource.endpoint;
        this.gkeClusterCaCertificate = aptosResource.masterAuth.apply(masterAuth => masterAuth.clusterCaCertificate);
        this.gkeClusterWorkloadIdentityConfig = aptosResource.workloadIdentityConfig;
        this.registerOutputs({
            validatorEndpoint: args.zoneName != "" && args.createDnsRecords ? std.trimsuffixOutput({
                input: validator[0].name,
                suffix: ".",
            }).apply(invoke => `/dns4/${invoke.result}/tcp/${validator_lb[0].spec[0].port[0].port}`) : undefined,
            fullnodeEndpoint: args.zoneName != "" && args.createDnsRecords ? std.trimsuffixOutput({
                input: fullnode[0].name,
                suffix: ".",
            }).apply(invoke => `/dns4/${invoke.result}/tcp/${fullnode_lb[0].spec[0].port[0].port}`) : undefined,
            helmReleaseName: validatorResource.name,
            gkeClusterEndpoint: aptosResource.endpoint,
            gkeClusterCaCertificate: aptosResource.masterAuth.clusterCaCertificate,
            gkeClusterWorkloadIdentityConfig: aptosResource.workloadIdentityConfig,
        });
    }
}

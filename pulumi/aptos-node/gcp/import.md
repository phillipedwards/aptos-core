### Don't need to alias
```
"urn:pulumi:gplay::aptos-node::pulumi:pulumi:Stack::aptos-node-gplay"
"urn:pulumi:gplay::aptos-node::pulumi:providers:gcp::default_6_66_0"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-cloudresourcemanager.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-monitoring.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-clouderrorreporting.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-logging.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-compute.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-iam.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-container.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-spanner.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-secretmanager.googleapis.com"
"urn:pulumi:gplay::aptos-node::gcp:projects/service:Service::services-cloudkms.googleapis.com"
"urn:pulumi:gplay::aptos-node::pulumi:providers:random::default_4_14_0"
"urn:pulumi:gplay::aptos-node::pulumi:providers:command::default_0_9_0"
"urn:pulumi:gplay::aptos-node::pulumi:providers:std::default_1_4_0"
"urn:pulumi:gplay::aptos-node::pulumi:providers:kubernetes::default_3_30_2"
```

### Need to Alias still
```
"urn:pulumi:gplay::aptos-node::gcp:compute/network:Network::aptos"
"urn:pulumi:gplay::aptos-node::gcp:container/nodePool:NodePool::utilities"
"urn:pulumi:gplay::aptos-node::gcp:compute/routerNat:RouterNat::nat"
"urn:pulumi:gplay::aptos-node::gcp:container/nodePool:NodePool::validators"
"urn:pulumi:gplay::aptos-node::gcp:container/cluster:Cluster::aptos_1"
"urn:pulumi:gplay::aptos-node::gcp:serviceAccount/account:Account::gke"
"urn:pulumi:gplay::aptos-node::random:index/randomString:RandomString::validator-dns"
"urn:pulumi:gplay::aptos-node::gcp:compute/address:Address::nat_1"
"urn:pulumi:gplay::aptos-node::random:index/randomId:RandomId::k8s-debugger-id"
"urn:pulumi:gplay::aptos-node::gcp:compute/router:Router::nat_2"
"urn:pulumi:gplay::aptos-node::gcp:projects/iAMCustomRole:IAMCustomRole::k8s-debugger"
```

```ts
Please copy the following code into your Pulumi application. Not doing so
will cause Pulumi to report that an update will happen on the next update command.

Please note that the imported resources are marked as protected. To destroy them
you will need to remove the `protect` option and run `pulumi update` *before*
the destroy will take effect.

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";

const nat = new gcp.compute.RouterNat("nat", {
    name: "aptos-default-nat",
    natIpAllocateOption: "MANUAL_ONLY",
    natIps: ["https://www.googleapis.com/compute/v1/projects/geoff-miller-pulumi-corp-play/regions/us-central1/addresses/aptos-default-nat"],
    project: "geoff-miller-pulumi-corp-play",
    region: "us-central1",
    router: "aptos-default-nat",
    sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_PRIMARY_IP_RANGES",
}, {
    protect: true,
});
const utilities = new gcp.container.NodePool("utilities", {
    autoscaling: {
        locationPolicy: "BALANCED",
        maxNodeCount: 10,
        minNodeCount: 1,
    },
    cluster: "aptos-default",
    location: "us-central1-a",
    management: {
        autoRepair: true,
        autoUpgrade: true,
    },
    maxPodsPerNode: 110,
    name: "utilities",
    networkConfig: {
        podIpv4CidrBlock: "10.4.0.0/14",
        podRange: "gke-aptos-default-pods-dc0b08c7",
    },
    nodeConfig: {
        diskSizeGb: 20,
        diskType: "pd-balanced",
        imageType: "COS_CONTAINERD",
        machineType: "n2-standard-8",
        metadata: {
            "disable-legacy-endpoints": "true",
        },
        oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
        serviceAccount: "aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
        shieldedInstanceConfig: {
            enableSecureBoot: true,
        },
        tags: ["utilities"],
        workloadMetadataConfig: {
            mode: "GKE_METADATA",
        },
    },
    nodeCount: 1,
    nodeLocations: ["us-central1-a"],
    project: "geoff-miller-pulumi-corp-play",
    upgradeSettings: {
        maxSurge: 1,
    },
    version: "1.27.3-gke.100",
}, {
    protect: true,
});
const aptos = new gcp.compute.Network("aptos", {
    name: "aptos-default",
    project: "geoff-miller-pulumi-corp-play",
    routingMode: "REGIONAL",
}, {
    protect: true,
});
const aptos_1 = new gcp.container.Cluster("aptos_1", {
    addonsConfig: {
        gcePersistentDiskCsiDriverConfig: {
            enabled: true,
        },
        networkPolicyConfig: {
            disabled: true,
        },
    },
    clusterIpv4Cidr: "10.4.0.0/14",
    clusterTelemetry: {
        type: "ENABLED",
    },
    databaseEncryption: {
        state: "DECRYPTED",
    },
    defaultMaxPodsPerNode: 110,
    defaultSnatStatus: {
        disabled: false,
    },
    initialNodeCount: 1,
    ipAllocationPolicy: {
        clusterIpv4CidrBlock: "10.4.0.0/14",
        clusterSecondaryRangeName: "gke-aptos-default-pods-dc0b08c7",
        podCidrOverprovisionConfig: {
            disabled: false,
        },
        servicesIpv4CidrBlock: "10.8.0.0/20",
        servicesSecondaryRangeName: "gke-aptos-default-services-dc0b08c7",
    },
    location: "us-central1-a",
    loggingConfig: {
        enableComponents: [
            "SYSTEM_COMPONENTS",
            "WORKLOADS",
        ],
    },
    loggingService: "logging.googleapis.com/kubernetes",
    maintenancePolicy: {
        recurringWindow: {
            endTime: "2023-06-15T23:59:00Z",
            recurrence: "FREQ=DAILY",
            startTime: "2023-06-15T00:00:00Z",
        },
    },
    masterAuth: {
        clientCertificateConfig: {
            issueClientCertificate: false,
        },
    },
    masterAuthorizedNetworksConfig: {
        cidrBlocks: [{
            cidrBlock: "0.0.0.0/0",
        }],
    },
    monitoringConfig: {
        advancedDatapathObservabilityConfigs: [{
            enableMetrics: false,
            relayMode: "DISABLED",
        }],
        enableComponents: ["SYSTEM_COMPONENTS"],
        managedPrometheus: {
            enabled: true,
        },
    },
    monitoringService: "monitoring.googleapis.com/kubernetes",
    name: "aptos-default",
    network: "projects/geoff-miller-pulumi-corp-play/global/networks/aptos-default",
    networkPolicy: {
        enabled: false,
    },
    networkingMode: "VPC_NATIVE",
    nodeConfig: {
        diskSizeGb: 20,
        diskType: "pd-balanced",
        imageType: "COS_CONTAINERD",
        machineType: "n2-standard-32",
        metadata: {
            "disable-legacy-endpoints": "true",
        },
        oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
        serviceAccount: "aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
        shieldedInstanceConfig: {
            enableSecureBoot: true,
        },
        tags: ["validators"],
        workloadMetadataConfig: {
            mode: "GKE_METADATA",
        },
    },
    nodePools: [
        {
            autoscaling: {
                locationPolicy: "BALANCED",
                maxNodeCount: 10,
                minNodeCount: 1,
            },
            management: {
                autoRepair: true,
                autoUpgrade: true,
            },
            maxPodsPerNode: 110,
            name: "validators",
            networkConfig: {
                podIpv4CidrBlock: "10.4.0.0/14",
                podRange: "gke-aptos-default-pods-dc0b08c7",
            },
            nodeConfig: {
                diskSizeGb: 20,
                diskType: "pd-balanced",
                imageType: "COS_CONTAINERD",
                machineType: "n2-standard-32",
                metadata: {
                    "disable-legacy-endpoints": "true",
                },
                oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
                serviceAccount: "aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                },
                tags: ["validators"],
                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },
            },
            nodeCount: 1,
            nodeLocations: ["us-central1-a"],
            upgradeSettings: {
                maxSurge: 1,
            },
            version: "1.27.3-gke.100",
        },
        {
            autoscaling: {
                locationPolicy: "BALANCED",
                maxNodeCount: 10,
                minNodeCount: 1,
            },
            management: {
                autoRepair: true,
                autoUpgrade: true,
            },
            maxPodsPerNode: 110,
            name: "utilities",
            networkConfig: {
                podIpv4CidrBlock: "10.4.0.0/14",
                podRange: "gke-aptos-default-pods-dc0b08c7",
            },
            nodeConfig: {
                diskSizeGb: 20,
                diskType: "pd-balanced",
                imageType: "COS_CONTAINERD",
                machineType: "n2-standard-8",
                metadata: {
                    "disable-legacy-endpoints": "true",
                },
                oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
                serviceAccount: "aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
                shieldedInstanceConfig: {
                    enableSecureBoot: true,
                },
                tags: ["utilities"],
                workloadMetadataConfig: {
                    mode: "GKE_METADATA",
                },
            },
            nodeCount: 1,
            nodeLocations: ["us-central1-a"],
            upgradeSettings: {
                maxSurge: 1,
            },
            version: "1.27.3-gke.100",
        },
    ],
    nodeVersion: "1.27.3-gke.100",
    notificationConfig: {
        pubsub: {
            enabled: false,
        },
    },
    podSecurityPolicyConfig: {
        enabled: false,
    },
    privateClusterConfig: {
        enablePrivateNodes: true,
        masterGlobalAccessConfig: {
            enabled: false,
        },
        masterIpv4CidrBlock: "172.16.0.0/28",
    },
    project: "geoff-miller-pulumi-corp-play",
    protectConfig: {
        workloadConfig: {
            auditMode: "BASIC",
        },
        workloadVulnerabilityMode: "WORKLOAD_VULNERABILITY_MODE_UNSPECIFIED",
    },
    releaseChannel: {
        channel: "REGULAR",
    },
    securityPostureConfig: {
        mode: "BASIC",
        vulnerabilityMode: "VULNERABILITY_MODE_UNSPECIFIED",
    },
    serviceExternalIpsConfig: {
        enabled: false,
    },
    subnetwork: "projects/geoff-miller-pulumi-corp-play/regions/us-central1/subnetworks/aptos-default",
    workloadIdentityConfig: {
        workloadPool: "geoff-miller-pulumi-corp-play.svc.id.goog",
    },
}, {
    protect: true,
});
const validators = new gcp.container.NodePool("validators", {
    autoscaling: {
        locationPolicy: "BALANCED",
        maxNodeCount: 10,
        minNodeCount: 1,
    },
    cluster: "aptos-default",
    location: "us-central1-a",
    management: {
        autoRepair: true,
        autoUpgrade: true,
    },
    maxPodsPerNode: 110,
    name: "validators",
    networkConfig: {
        podIpv4CidrBlock: "10.4.0.0/14",
        podRange: "gke-aptos-default-pods-dc0b08c7",
    },
    nodeConfig: {
        diskSizeGb: 20,
        diskType: "pd-balanced",
        imageType: "COS_CONTAINERD",
        machineType: "n2-standard-32",
        metadata: {
            "disable-legacy-endpoints": "true",
        },
        oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
        serviceAccount: "aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
        shieldedInstanceConfig: {
            enableSecureBoot: true,
        },
        tags: ["validators"],
        workloadMetadataConfig: {
            mode: "GKE_METADATA",
        },
    },
    nodeCount: 1,
    nodeLocations: ["us-central1-a"],
    project: "geoff-miller-pulumi-corp-play",
    upgradeSettings: {
        maxSurge: 1,
    },
    version: "1.27.3-gke.100",
}, {
    protect: true,
});
const services_clouderrorreporting_googleapis_com = new gcp.projects.Service("services-clouderrorreporting.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "clouderrorreporting.googleapis.com",
}, {
    protect: true,
});
const services_cloudkms_googleapis_com = new gcp.projects.Service("services-cloudkms.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "cloudkms.googleapis.com",
}, {
    protect: true,
});
const services_compute_googleapis_com = new gcp.projects.Service("services-compute.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "compute.googleapis.com",
}, {
    protect: true,
});
const services_logging_googleapis_com = new gcp.projects.Service("services-logging.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "logging.googleapis.com",
}, {
    protect: true,
});
const services_monitoring_googleapis_com = new gcp.projects.Service("services-monitoring.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "monitoring.googleapis.com",
}, {
    protect: true,
});
const services_secretmanager_googleapis_com = new gcp.projects.Service("services-secretmanager.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "secretmanager.googleapis.com",
}, {
    protect: true,
});
const services_spanner_googleapis_com = new gcp.projects.Service("services-spanner.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "spanner.googleapis.com",
}, {
    protect: true,
});
const services_cloudresourcemanager_googleapis_com = new gcp.projects.Service("services-cloudresourcemanager.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "cloudresourcemanager.googleapis.com",
}, {
    protect: true,
});
const services_container_googleapis_com = new gcp.projects.Service("services-container.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "container.googleapis.com",
}, {
    protect: true,
});
const services_iam_googleapis_com = new gcp.projects.Service("services-iam.googleapis.com", {
    project: "geoff-miller-pulumi-corp-play",
    service: "iam.googleapis.com",
}, {
    protect: true,
});
const gke = new gcp.serviceaccount.Account("gke", {
    accountId: "aptos-default-gke",
    project: "geoff-miller-pulumi-corp-play",
}, {
    protect: true,
});
const validator_dns = new random.RandomString("validator-dns", {
    length: 16,
    lower: true,
    number: true,
    numeric: true,
    special: true,
    upper: true,
}, {
    protect: true,
});
const nat_1 = new gcp.compute.Address("nat_1", {
    address: "34.68.236.115",
    name: "aptos-default-nat",
    networkTier: "PREMIUM",
    project: "geoff-miller-pulumi-corp-play",
    region: "us-central1",
}, {
    protect: true,
});
const nat_2 = new gcp.compute.Router("nat_2", {
    name: "aptos-default-nat",
    network: "https://www.googleapis.com/compute/v1/projects/geoff-miller-pulumi-corp-play/global/networks/aptos-default",
    project: "geoff-miller-pulumi-corp-play",
    region: "us-central1",
}, {
    protect: true,
});
const k8s_debugger_id = new random.RandomId("k8s-debugger-id", {byteLength: 4}, {
    protect: true,
});
const k8s_debugger = new gcp.projects.IAMCustomRole("k8s-debugger", {
    description: "Additional permissions to debug Kubernetes Engine workloads",
    permissions: [
        "container.pods.portForward",
        "container.pods.exec",
    ],
    project: "geoff-miller-pulumi-corp-play",
    roleId: "container.debugger.08feee41",
    title: "Kubernetes Engine Debugger",
}, {
    protect: true,
});
```

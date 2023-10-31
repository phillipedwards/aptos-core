import * as yaml from "yaml";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import * as k8sClientLib from '@kubernetes/client-node';
import { awsProvider } from './aws'

export interface KubernetesConfig {
    aptosNodeHelmChartPath?: pulumi.Input<string>;
    chainId: pulumi.Input<string>;
    chainName: pulumi.Input<string>;
    enableCalico?: pulumi.Input<boolean>;
    enableKubeStateMetrics?: pulumi.Input<boolean>;
    enableLogger?: pulumi.Input<boolean>;
    enableMonitoring?: pulumi.Input<boolean>;
    enablePrometheusNodeExporter?: pulumi.Input<boolean>;
    enableValidator?: pulumi.Input<boolean>;
    era: pulumi.Input<number>;
    fullNodeStorageClass?: pulumi.Input<string>;
    iamPath: pulumi.Input<string>;
    imageTag: pulumi.Input<string>;
    k8sAdminRoles: pulumi.Input<string>[];
    k8sAdmins: pulumi.Input<string>[];
    k8sDebuggerRoles?: pulumi.Input<string>[];
    k8sDebuggers?: pulumi.Input<string>[];
    k8sViewerRoles?: pulumi.Input<string>[];
    k8sViewers?: pulumi.Input<string>[];
    loggerHelmChartPath?: pulumi.Input<string>;
    manageViaPulumi: pulumi.Input<boolean>;
    monitoringHelmChartPath?: pulumi.Input<string>;
    numFullnodeGroups: pulumi.Input<number>;
    numValidators: pulumi.Input<number>;
    tags?: pulumi.Input<aws.Tags>;
    validatorName: pulumi.Input<string>;
    validatorStorageClass?: pulumi.Input<string>;
}

export interface KubernetesArgs extends KubernetesConfig {
    domain: pulumi.Input<string>;
    helmReleaseName: pulumi.Input<string>;
    nodesIamRoleArn: pulumi.Input<string>;
    eksCluster: aws.eks.Cluster;
    vpcId: pulumi.Input<string>;
    subnetIds: pulumi.Input<string>[];
    region: pulumi.Input<string>;
}

/**
 * Represents a Kubernetes resource that creates various Kubernetes resources such as StorageClass, Namespace, HelmRelease, etc.
 * @class
 * @extends pulumi.ComponentResource
 */
export class Kubernetes extends pulumi.ComponentResource {
    public readonly gp3StorageClass: k8s.storage.v1.StorageClass;
    public readonly io1StorageClass: k8s.storage.v1.StorageClass;
    public readonly io2StorageClass: k8s.storage.v1.StorageClass;
    public readonly calicoHelmRelease?: k8s.helm.v3.Release;
    public readonly validatorHelmRelease?: k8s.helm.v3.Release;
    public readonly loggerHelmRelease?: k8s.helm.v3.Release;
    public readonly monitoringHelmRelease?: k8s.helm.v3.Release;
    public readonly debugClusterRole: k8s.rbac.v1.ClusterRole;
    public readonly debuggersRoleBinding: k8s.rbac.v1.RoleBinding;
    public readonly viewersRoleBinding: k8s.rbac.v1.RoleBinding;
    public readonly awsAuthConfigMap: k8s.core.v1.ConfigMap;
    public readonly provider: k8s.Provider;

    constructor(name: string, args: KubernetesArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Kubernetes", name, {}, opts);

        const accountId = aws.getCallerIdentity({ provider: awsProvider }).then(it => it.accountId);

        // SET DEFAULTS
        if (!args.aptosNodeHelmChartPath) { args.aptosNodeHelmChartPath = "" }
        if (!args.fullNodeStorageClass) { args.fullNodeStorageClass = "io1" }
        if (!args.validatorStorageClass) { args.validatorStorageClass = "io1" }
        if (!args.k8sDebuggerRoles) { args.k8sDebuggerRoles = [] }
        if (!args.k8sDebuggers) { args.k8sDebuggers = [] }
        if (!args.k8sViewerRoles) { args.k8sViewerRoles = [] }
        if (!args.k8sViewers) { args.k8sViewers = [] }
        if (!args.loggerHelmChartPath) { args.loggerHelmChartPath = "" }
        if (!args.monitoringHelmChartPath) { args.monitoringHelmChartPath = "" }
        if (!args.enableCalico) { args.enableCalico = false }
        if (!args.enableLogger) { args.enableLogger = false }
        if (!args.enableMonitoring) { args.enableMonitoring = false }
        if (!args.enablePrometheusNodeExporter) { args.enablePrometheusNodeExporter = false }
        if (!args.enableValidator) { args.enableValidator = false }
        if (!args.tags) { args.tags = {} }

        const kubeconfig = pulumi.all([
            args.eksCluster.name,
            args.eksCluster.endpoint,
            args.eksCluster.certificateAuthority.data,
            args.region,
            accountId,
        ]).apply(([name, endpoint, caData, region, accountId]) => {
            const context = `arn:aws:eks:${region}:${accountId}:cluster/${name}`;
            const kubeconfigBuilder = new k8sClientLib.KubeConfig();
            kubeconfigBuilder.loadFromOptions({
                clusters: [
                    {
                        name: context,
                        server: endpoint,
                        caData: caData,
                    },
                ],
                contexts: [
                    {
                        name: context,
                        cluster: context,
                        user: context,
                    },
                ],
                currentContext: context,
                users: [
                    {
                        name: context,
                        authProvider: undefined,
                        exec: {
                            apiVersion: "client.authentication.k8s.io/v1beta1",
                            command: "aws",
                            installHint: "Install the aws cli",
                            args: [
                                "--region",
                                region,
                                "eks",
                                "get-token",
                                "--cluster-name",
                                name,
                            ],
                        },
                    },
                ],
            });
            return kubeconfigBuilder;
        });

        this.provider = new k8s.Provider(`k8s`, {
            kubeconfig: kubeconfig.apply(kubeconfig => kubeconfig.exportConfig()),
        }, {
            parent: this
        });

        // const kubeconfig = new k8sClientLib.KubeConfig();
        // kubeconfig.loadFromOptions({
        //     clusters: [
        //         {
        //             name: String(args.eksCluster.name),
        //             server: String(args.eksCluster.endpoint),
        //             caData: String(args.eksCluster.certificateAuthority.data),
        //         },
        //     ],
        //     contexts: [
        //         {
        //             name: String(args.eksCluster.name),
        //             cluster: String(args.eksCluster.name),
        //             user: String(args.eksCluster.name),
        //         },
        //     ],
        //     currentContext: String(args.eksCluster.name),
        //     users: [
        //         {
        //             name: String(args.eksCluster.name),
        //             token: String(args.eksCluster.identities.apply(identities => identities[0].oidcs?.[0]?.issuer)).split("id/")[1],
        //             authProvider: undefined,
        //             exec: undefined,
        //         },
        //     ],
        // })

        // this.provider = new k8s.Provider(`k8s`, {
        //     kubeconfig: kubeconfig.exportConfig(),
        // }, { parent: this });

        const provider = this.provider;

        this.gp3StorageClass = new k8s.storage.v1.StorageClass(`gp3`, {
            metadata: {
                name: "gp3",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "gp3",
            },
            reclaimPolicy: "Delete",
        }, { provider, parent: this });

        this.io1StorageClass = new k8s.storage.v1.StorageClass(`io1`, {
            metadata: {
                name: "io1",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "io1",
            },
            reclaimPolicy: "Delete",
        }, { provider, parent: this });

        this.io2StorageClass = new k8s.storage.v1.StorageClass(`io2`, {
            metadata: {
                name: "io2",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "io2",
            },
            reclaimPolicy: "Delete",
        }, { provider, parent: this });

        const tigeraNamespace = new k8s.core.v1.Namespace(`tigera`, {
            metadata: {
                name: "tigera-operator",
            },
        }, { provider, parent: this });

        if (args.enableCalico) {
            this.calicoHelmRelease = new k8s.helm.v3.Release(`calico`, {
                repositoryOpts: {
                    repo: "https://docs.tigera.io/calico/charts",
                },
                chart: "tigera-operator",
                name: "calico",
                version: "3.26.0",
                namespace: tigeraNamespace.metadata.name,
            }, { provider, parent: this });
        }

        let loggerRemoteAddress = {}

        if (args.enableLogger) {
            this.loggerHelmRelease = new k8s.helm.v3.Release(`logger`, {
                chart: args.loggerHelmChartPath,
                maxHistory: 5,
                waitForJobs: false,
                values: {
                    logger: {
                        name: "aptos-logger",
                    },
                    chain: {
                        name: args.chainName,
                    },
                    serviceAccount: {
                        create: false,
                        name: args.helmReleaseName === "aptos-node" ? "aptos-node-validator" : pulumi.interpolate`${args.helmReleaseName}-aptos-node-validator`,
                    },
                },
            }, { provider, parent: this });
            loggerRemoteAddress = {
                remoteLogAddress: args.enableLogger ? pulumi.interpolate`${this.loggerHelmRelease.name}-aptos-logger.${this.loggerHelmRelease.namespace}.svc:5044` : undefined,
            }
        }

        if (args.enableValidator) {
            this.validatorHelmRelease = new k8s.helm.v3.Release(`validator`, {
                chart: args.helmReleaseName,
                version: args.aptosNodeHelmChartPath,
                waitForJobs: false,
                maxHistory: 5,
                values: {
                    numValidators: args.numValidators,
                    numFullnodeGroups: args.numFullnodeGroups,
                    imageTag: args.imageTag,
                    manageImages: args.manageViaPulumi,
                    chain: {
                        era: args.era,
                        chain_id: args.chainId,
                        name: args.chainName,
                    },
                    validator: {
                        name: args.validatorName,
                        storage: {
                            class: args.validatorStorageClass,
                        },
                        nodeSelector: {
                            "eks.amazonaws.com/nodegroup": "validators",
                        },
                        tolerations: [{
                            key: "aptos.org/nodepool",
                            value: "validators",
                            effect: "NoExecute",
                        }],
                        ...loggerRemoteAddress,
                    },
                    fullnode: {
                        storage: {
                            class: args.fullNodeStorageClass,
                        },
                        nodeSelector: {
                            "eks.amazonaws.com/nodegroup": "validators",
                        },
                        tolerations: [{
                            key: "aptos.org/nodepool",
                            value: "validators",
                            effect: "NoExecute",
                        }]
                    },
                    haproxy: {
                        nodeSelector: {
                            "eks.amazonaws.com/nodegroup": "utilities",
                        }
                    },
                    service: {
                        domain: args.domain,
                    },
                },
            }, { provider, parent: this });
        }
        if (args.enableMonitoring) {
            this.monitoringHelmRelease = new k8s.helm.v3.Release(`monitoring`, {
                name: pulumi.interpolate`${args.helmReleaseName}-mon`,
                chart: args.monitoringHelmChartPath,
                maxHistory: 5,
                waitForJobs: false,
                values: {
                    chain: {
                        name: args.chainName,
                    },
                    validator: {
                        name: args.validatorName,
                    },
                    service: {
                        domain: args.domain,
                    },
                    monitoring: {
                        prometheus: {
                            storage: {
                                class: this.gp3StorageClass.metadata.name
                            }
                        }
                    },
                    "kube-state-metrics": {
                        enabled: args.enableKubeStateMetrics,
                    },
                    "prometheus-node-exporter": {
                        enabled: args.enablePrometheusNodeExporter,
                    },
                },
            }, { provider, parent: this });

        }
        this.debugClusterRole = new k8s.rbac.v1.ClusterRole(`debug`, {
            metadata: {
                name: "debug",
            },
            rules: [
                {
                    apiGroups: [""],
                    resources: ["pods/portforward", "pods/exec"],
                    verbs: ["create"],
                },
            ],
        }, { provider, parent: this });

        this.debuggersRoleBinding = new k8s.rbac.v1.RoleBinding(`debuggers`, {
            metadata: {
                name: "debuggers",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: this.debugClusterRole.metadata.name,
            },
            subjects: [
                {
                    kind: "Group",
                    name: "debuggers",
                },
            ],
        }, { provider, parent: this });

        this.viewersRoleBinding = new k8s.rbac.v1.RoleBinding(`viewers`, {
            metadata: {
                name: "viewers",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "view",
            },
            subjects: [
                {
                    kind: "Group",
                    name: "viewers",
                },
                {
                    kind: "Group",
                    name: "debuggers",
                },
            ],
        }, { provider, parent: this });

        let mapRolesList = []
        let mapUsersList = []

        for (const role of args.k8sAdminRoles) {
            mapRolesList.push({
                rolearn: pulumi.interpolate`arn:aws:iam::${accountId}:role/${role}`,
                username: pulumi.interpolate`${role}:{{SessionName}}`,
                groups: `["system:masters"]`,
            })
        }

        for (const role of args.k8sViewerRoles) {
            mapRolesList.push({
                rolearn: pulumi.interpolate`arn:aws:iam::${accountId}:role/${role}`,
                username: pulumi.interpolate`${role}:{{SessionName}}`,
                groups: `["viewers"]`,
            })
        }

        for (const role of args.k8sDebuggerRoles) {
            mapRolesList.push({
                rolearn: pulumi.interpolate`arn:aws:iam::${accountId}:role/${role}`,
                username: pulumi.interpolate`${role}:{{SessionName}}`,
                groups: `["debuggers"]`,
            })
        }

        for (const user of args.k8sAdmins) {
            mapUsersList.push({
                userarn: pulumi.interpolate`arn:aws:iam::${accountId}:user/${user}`,
                username: user,
                groups: `["system:masters"]`,
            })
        }

        for (const user of args.k8sViewers) {
            mapUsersList.push({
                userarn: pulumi.interpolate`arn:aws:iam::${accountId}:user/${user}`,
                username: user,
                groups: `["viewers"]`,
            })
        }

        for (const user of args.k8sDebuggers) {
            mapUsersList.push({
                userarn: pulumi.interpolate`arn:aws:iam::${accountId}:user/${user}`,
                username: user,
                groups: `["debuggers"]`,
            })
        }

        this.awsAuthConfigMap = new k8s.core.v1.ConfigMap(`aws-auth`, {
            metadata: {
                name: "aws-auth",
                namespace: "kube-system",
            },
            data: {
                mapUsers: yaml.stringify(mapUsersList),
                mapRoles: yaml.stringify(mapRolesList),
            },
        }, { provider, parent: this });
    }
}

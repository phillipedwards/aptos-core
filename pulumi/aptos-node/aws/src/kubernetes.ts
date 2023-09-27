import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";

interface KubernetesConfig {
    eksCluster: aws.eks.Cluster;
    vpcId: pulumi.Input<string>;
    subnetIds: pulumi.Input<string>[];
    tags?: pulumi.Input<aws.Tags>;

}

export class Kubernetes extends pulumi.ComponentResource {
    public readonly gp3StorageClass: k8s.storage.v1.StorageClass;
    public readonly io1StorageClass: k8s.storage.v1.StorageClass;
    public readonly io2StorageClass: k8s.storage.v1.StorageClass;
    public readonly tigeraOperatorNamespace: k8s.core.v1.Namespace;
    public readonly calicoHelmRelease: k8s.helm.v3.Release;
    public readonly validatorHelmRelease: k8s.helm.v3.Release;
    public readonly loggerHelmRelease: k8s.helm.v3.Release;
    public readonly monitoringHelmRelease: k8s.helm.v3.Release;
    public readonly debugClusterRole: k8s.rbac.v1.ClusterRole;
    public readonly debuggersRoleBinding: k8s.rbac.v1.RoleBinding;
    public readonly viewersRoleBinding: k8s.rbac.v1.RoleBinding;
    public readonly awsAuthConfigMap: k8s.core.v1.ConfigMap;

    constructor(name: string, args: KubernetesConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Kubernetes", name, {}, opts);

        const provider = new k8s.Provider(`k8s`, {
            kubeconfig: args.eksCluster.kubeconfig,
            // kubeconfig: aws.eks.getCluster({ name: name }).then(cluster => cluster.certificateAuthorities?.),
        }, { parent: this });

        const gp3StorageClass = new k8s.storage.v1.StorageClass(`${name}-gp3-storage-class`, {
            metadata: {
                name: "gp3",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "gp3",
            },
            reclaimPolicy: "Delete",
        }, { provider, parent: this });

        const io1StorageClass = new k8s.storage.v1.StorageClass(`${name}-io1-storage-class`, {
            metadata: {
                name: "io1",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "io1",
            },
            reclaimPolicy: "Delete",
        }, { provider, parent: this });

        const io2StorageClass = new k8s.storage.v1.StorageClass(`${name}-io2-storage-class`, {
            metadata: {
                name: "io2",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "io2",
            },
            reclaimPolicy: "Delete",
        }, { provider, parent: this });

        const tigeraOperatorNamespace = new k8s.core.v1.Namespace(`${name}-tigera-operator-namespace`, {
            metadata: {
                name: "tigera-operator",
            },
        }, { provider, parent: this });

        const calicoHelmRelease = new k8s.helm.v3.Release(`${name}-calico-helm-release`, {
            chart: "calico/tigera-operator",
            version: "v1.20.1",
            namespace: tigeraOperatorNamespace.metadata.name,
            values: {
                "manager": {
                    "image": {
                        "repository": "quay.io/tigera/operator",
                        "tag": "v1.20.1",
                    },
                },
            },
        }, { provider, parent: this });

        const validatorHelmRelease = new k8s.helm.v3.Release(`${name}-validator-helm-release`, {
            chart: "tigera/validator",
            version: "v3.16.0",
            namespace: tigeraOperatorNamespace.metadata.name,
            values: {
                "image": {
                    "repository": "quay.io/tigera/validator",
                    "tag": "v3.16.0",
                },
            },
        }, { provider, parent: this });

        const loggerHelmRelease = new k8s.helm.v3.Release(`${name}-logger-helm-release`, {
            chart: "tigera/fluentd-elasticsearch",
            version: "v2.14.0",
            namespace: tigeraOperatorNamespace.metadata.name,
            values: {
                "image": {
                    "repository": "quay.io/tigera/fluentd-elasticsearch",
                    "tag": "v2.14.0",
                },
            },
        }, { provider, parent: this });

        const monitoringHelmRelease = new k8s.helm.v3.Release(`${name}-monitoring-helm-release`, {
            chart: "tigera/prometheus",
            version: "v2.25.0",
            namespace: tigeraOperatorNamespace.metadata.name,
            values: {
                "prometheus": {
                    "image": {
                        "repository": "quay.io/prometheus/prometheus",
                        "tag": "v2.25.0",
                    },
                },
            },
        }, { provider, parent: this });

        const debugClusterRole = new k8s.rbac.v1.ClusterRole(`${name}-debug-cluster-role`, {
            metadata: {
                name: "debug",
            },
            rules: [
                {
                    apiGroups: [""],
                    resources: ["pods"],
                    verbs: ["get", "list", "watch"],
                },
                {
                    apiGroups: [""],
                    resources: ["pods/log"],
                    verbs: ["get", "list", "watch"],
                },
            ],
        }, { provider, parent: this });

        const debuggersRoleBinding = new k8s.rbac.v1.RoleBinding(`${name}-debuggers-role-binding`, {
            metadata: {
                name: "debuggers",
                namespace: "default",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: debugClusterRole.metadata.name,
            },
            subjects: [
                {
                    kind: "Group",
                    name: "system:masters",
                },
            ],
        }, { provider, parent: this });

        const viewersRoleBinding = new k8s.rbac.v1.RoleBinding(`${name}-viewers-role-binding`, {
            metadata: {
                name: "viewers",
                namespace: "default",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "view",
            },
            subjects: [
                {
                    kind: "Group",
                    name: "system:authenticated",
                },
            ],
        }, { provider, parent: this });

        const awsAuthConfigMap = new k8s.core.v1.ConfigMap(`${name}-aws-auth-config-map`, {
            metadata: {
                name: "aws-auth",
                namespace: "kube-system",
            },
            data: {
                "mapRoles": JSON.stringify([
                    {
                        "rolearn": pulumi.interpolate`arn:aws:iam::${aws.getCallerIdentity().then(current => current.accountId)}:role/eks-node-group-role`,
                        "username": "system:node:{{EC2PrivateDNSName}}",
                        "groups": [
                            "system:bootstrappers",
                            "system:nodes",
                        ],
                    },
                ]),
            },
        }, { provider, parent: this });

        this.gp3StorageClass = gp3StorageClass;
        this.io1StorageClass = io1StorageClass;
        this.io2StorageClass = io2StorageClass;
        this.tigeraOperatorNamespace = tigeraOperatorNamespace;
        this.calicoHelmRelease = calicoHelmRelease;
        this.validatorHelmRelease = validatorHelmRelease;
        this.loggerHelmRelease = loggerHelmRelease;
        this.monitoringHelmRelease = monitoringHelmRelease;
        this.debugClusterRole = debugClusterRole;
        this.debuggersRoleBinding = debuggersRoleBinding;
        this.viewersRoleBinding = viewersRoleBinding;
        this.awsAuthConfigMap = awsAuthConfigMap;

        this.registerOutputs({
            gp3StorageClass: this.gp3StorageClass,
            io1StorageClass: this.io1StorageClass,
            io2StorageClass: this.io2StorageClass,
            tigeraOperatorNamespace: this.tigeraOperatorNamespace,
            calicoHelmRelease: this.calicoHelmRelease,
            validatorHelmRelease: this.validatorHelmRelease,
            loggerHelmRelease: this.loggerHelmRelease,
            monitoringHelmRelease: this.monitoringHelmRelease,
            debugClusterRole: this.debugClusterRole,
            debuggersRoleBinding: this.debuggersRoleBinding,
            viewersRoleBinding: this.viewersRoleBinding,
            awsAuthConfigMap: this.awsAuthConfigMap,
        });
    }
}

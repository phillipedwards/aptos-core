import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export interface KubernetesConfig {
    namespace: pulumi.Input<string>;
}

export class Kubernetes extends pulumi.ComponentResource {
    public readonly deleteGp2: pulumi.Resource;
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

    constructor(name: string, config: KubernetesConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:kubernetes:Kubernetes", name, {}, opts);

        // Create a null resource to delete the gp2 storage class
        this.deleteGp2 = new pulumi.Resource(`delete-gp2`, {}, { parent: this });

        // Create new storage classes for gp3, io1, and io2
        this.gp3StorageClass = new k8s.storage.v1.StorageClass(`gp3-storage-class`, {
            metadata: {
                name: "gp3",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "gp3",
            },
        }, { parent: this });

        this.io1StorageClass = new k8s.storage.v1.StorageClass(`io1-storage-class`, {
            metadata: {
                name: "io1",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "io1",
            },
        }, { parent: this });

        this.io2StorageClass = new k8s.storage.v1.StorageClass(`io2-storage-class`, {
            metadata: {
                name: "io2",
            },
            provisioner: "kubernetes.io/aws-ebs",
            parameters: {
                type: "io2",
            },
        }, { parent: this });

        // Create a new namespace for the Tigera operator
        this.tigeraOperatorNamespace = new k8s.core.v1.Namespace(`tigera-operator-namespace`, {
            metadata: {
                name: config.namespace,
            },
        }, { parent: this });

        // Create new Helm releases for Calico, Validator, Logger, and Monitoring
        this.calicoHelmRelease = new k8s.helm.v3.Release(`calico-helm-release`, {
            chart: "calico",
            version: "3.16.1",
            namespace: config.namespace,
            repositoryOpts: {
                repo: "https://docs.projectcalico.org/charts",
            },
            values: {
                // ...
            },
        }, { parent: this });

        this.validatorHelmRelease = new k8s.helm.v3.Release(`validator-helm-release`, {
            chart: "validator",
            version: "0.1.0",
            namespace: config.namespace,
            repositoryOpts: {
                repo: "https://charts.example.com",
            },
            values: {
                // ...
            },
        }, { parent: this });

        this.loggerHelmRelease = new k8s.helm.v3.Release(`logger-helm-release`, {
            chart: "logger",
            version: "0.1.0",
            namespace: config.namespace,
            repositoryOpts: {
                repo: "https://charts.example.com",
            },
            values: {
                // ...
            },
        }, { parent: this });

        this.monitoringHelmRelease = new k8s.helm.v3.Release(`monitoring-helm-release`, {
            chart: "monitoring",
            version: "0.1.0",
            namespace: config.namespace,
            repositoryOpts: {
                repo: "https://charts.example.com",
            },
            values: {
                // ...
            },
        }, { parent: this });

        // Create new cluster roles and role bindings for debuggers and viewers
        this.debugClusterRole = new k8s.rbac.v1.ClusterRole(`debug-cluster-role`, {
            metadata: {
                name: "debug",
            },
            rules: [{
                apiGroups: [""],
                resources: ["pods"],
                verbs: ["get", "list", "watch"],
            }],
        }, { parent: this });

        this.debuggersRoleBinding = new k8s.rbac.v1.RoleBinding(`debuggers-role-binding`, {
            metadata: {
                name: "debuggers",
                namespace: config.namespace,
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "debug",
            },
            subjects: [{
                kind: "Group",
                name: "debuggers",
            }],
        }, { parent: this });

        this.viewersRoleBinding = new k8s.rbac.v1.RoleBinding(`viewers-role-binding`, {
            metadata: {
                name: "viewers",
                namespace: config.namespace,
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "view",
            },
            subjects: [{
                kind: "Group",
                name: "viewers",
            }],
        }, { parent: this });

        // Create a new config map for the AWS authentication
        this.awsAuthConfigMap = new k8s.core.v1.ConfigMap(`aws-auth-config-map`, {
            metadata: {
                name: "aws-auth",
                namespace: "kube-system",
            },
            data: {
                // ...
            },
        }, { parent: this });

        // Export the Kubernetes information
        this.registerOutputs({
            gp3StorageClassName: this.gp3StorageClass.metadata.name,
            io1StorageClassName: this.io1StorageClass.metadata.name,
            io2StorageClassName: this.io2StorageClass.metadata.name,
            tigeraOperatorNamespaceName: this.tigeraOperatorNamespace.metadata.name,
            calicoHelmReleaseName: this.calicoHelmRelease.metadata.name,
            validatorHelmReleaseName: this.validatorHelmRelease.metadata.name,
            loggerHelmReleaseName: this.loggerHelmRelease.metadata.name,
            monitoringHelmReleaseName: this.monitoringHelmRelease.metadata.name,
            debugClusterRoleName: this.debugClusterRole.metadata.name,
            debuggersRoleBindingName: this.debuggersRoleBinding.metadata.name,
            viewersRoleBindingName: this.viewersRoleBinding.metadata.name,
            awsAuthConfigMapName: this.awsAuthConfigMap.metadata.name,
        });
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export interface SecurityConfig {
    namespace: pulumi.Input<string>;
}

export class Security extends pulumi.ComponentResource {
    public readonly disablePspRoleBinding: k8s.rbac.v1.RoleBinding;
    public readonly deletePspAuthenticated: pulumi.Resource;
    public readonly pssDefaultLabels: k8s.core.v1.Namespace;

    constructor(name: string, config: SecurityConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:security:Security", name, {}, opts);

        // Create a new role binding to disable the PodSecurityPolicy admission controller
        this.disablePspRoleBinding = new k8s.rbac.v1.RoleBinding(`disable-psp`, {
            metadata: {
                namespace: config.namespace,
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "psp:unprivileged",
            },
            subjects: [{
                kind: "ServiceAccount",
                name: "default",
                namespace: config.namespace,
            }],
        }, { parent: this });

        // Create a null resource to delete the authenticated PodSecurityPolicy
        this.deletePspAuthenticated = new pulumi.Resource(`delete-psp-authenticated`, {
            dependsOn: [this.disablePspRoleBinding],
        }, { parent: this });

        // Create a new namespace with PSS default labels
        this.pssDefaultLabels = new k8s.core.v1.Namespace(`pss`, {
            metadata: {
                name: config.namespace,
                labels: {
                    "pss-default": "true",
                },
            },
        }, { parent: this });

        // Export the security information
        this.registerOutputs({
            disablePspRoleBindingName: this.disablePspRoleBinding.metadata.name,
            deletePspAuthenticatedId: this.deletePspAuthenticated.id,
            pssDefaultLabelsName: this.pssDefaultLabels.metadata.name,
        });
    }
}

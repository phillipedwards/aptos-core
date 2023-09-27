import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface AuthConfig {
    clusterRoleName: pulumi.Input<string>;
    clusterRolePolicy: pulumi.Input<string>;
    clusterServiceAccountName: pulumi.Input<string>;
    nodesRoleName: pulumi.Input<string>;
    nodesRolePolicy: pulumi.Input<string>;
    nodesInstanceProfileName: pulumi.Input<string>;
}

export class Auth extends pulumi.ComponentResource {
    public readonly clusterRole: gcp.serviceaccount.Role;
    public readonly clusterRolePolicyAttachment: gcp.serviceaccount.RoleIAMPolicyAttachment;
    public readonly clusterServiceAccount: gcp.serviceaccount.Account;
    public readonly nodesRole: gcp.serviceaccount.Role;
    public readonly nodesRolePolicyAttachment: gcp.serviceaccount.RoleIAMPolicyAttachment;
    public readonly nodesInstanceProfile: gcp.compute.InstanceIAMProfile;

    constructor(name: string, config: AuthConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:auth:Auth", name, {}, opts);

        // Create a new cluster role
        this.clusterRole = new gcp.serviceaccount.(`cluster-role`, {
            accountId: config.clusterServiceAccountName,
            roleId: config.clusterRoleName,
        }, { parent: this });

        // Attach the cluster role policy
        this.clusterRolePolicyAttachment = new gcp.serviceaccount.RoleIAMPolicyAttachment(`cluster-role-policy-attachment`, {
            policyData: config.clusterRolePolicy,
            role: this.clusterRole.name,
        }, { parent: this });

        // Create a new cluster service account
        this.clusterServiceAccount = new gcp.serviceaccount.Account(`gke`, {
            accountId: config.clusterServiceAccountName,
        }, { parent: this });

        // Create a new nodes role
        this.nodesRole = new gcp.serviceaccount.Role(`nodes-role`, {
            accountId: config.nodesInstanceProfileName,
            roleId: config.nodesRoleName,
        }, { parent: this });

        // Attach the nodes role policy
        this.nodesRolePolicyAttachment = new gcp.serviceaccount.RoleIAMPolicyAttachment(`nodes-role-policy-attachment`, {
            policyData: config.nodesRolePolicy,
            role: this.nodesRole.name,
        }, { parent: this });

        // Create a new nodes instance profile
        this.nodesInstanceProfile = new gcp.compute.InstanceIAMProfile(`nodes-instance-profile`, {
            instanceName: config.nodesInstanceProfileName,
            roles: [{
                role: this.nodesRole.name,
                members: [`serviceAccount:${this.clusterServiceAccount.email}`],
            }],
        }, { parent: this });

        // Export the auth information
        this.registerOutputs({
            clusterRoleName: this.clusterRole.name,
            clusterRolePolicyAttachmentName: this.clusterRolePolicyAttachment.name,
            clusterServiceAccountName: this.clusterServiceAccount.name,
            nodesRoleName: this.nodesRole.name,
            nodesRolePolicyAttachmentName: this.nodesRolePolicyAttachment.name,
            nodesInstanceProfileName: this.nodesInstanceProfile.instanceName,
        });
    }
}

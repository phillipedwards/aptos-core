import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

export interface AuthConfig {
    projectId: pulumi.Input<string>;
    workspace: string;
}

export class Auth extends pulumi.ComponentResource {
    public readonly gkeServiceAccount: gcp.serviceaccount.Account;
    public readonly gkeLoggingIamMember: gcp.projects.IAMMember;
    public readonly gkeMetricsIamMember: gcp.projects.IAMMember;
    public readonly gkeMonitoringIamMember: gcp.projects.IAMMember;
    public readonly k8sDebuggerId: pulumi.Output<string>;
    public readonly k8sDebuggerCustomRole: gcp.projects.IAMCustomRole;

    constructor(name: string, config: AuthConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:auth:Auth", name, {}, opts);

        // Create a new GKE service account
        this.gkeServiceAccount = new gcp.serviceaccount.Account(`gke`, {
            accountId: `aptos-${config.workspace}-gke`,
        }, { parent: this });

        // Create new IAM members for GKE logging, metrics, and monitoring
        this.gkeLoggingIamMember = new gcp.projects.IAMMember(`gke-logging`, {
            project: config.projectId,
            role: "roles/logging.logWriter",
            member: `serviceAccount:${this.gkeServiceAccount.email}`,
        }, { parent: this });

        this.gkeMetricsIamMember = new gcp.projects.IAMMember(`gke-metrics`, {
            project: config.projectId,
            role: "roles/monitoring.metricWriter",
            member: `serviceAccount:${this.gkeServiceAccount.email}`,
        }, { parent: this });

        this.gkeMonitoringIamMember = new gcp.projects.IAMMember(`gke-monitoring`, {
            project: config.projectId,
            role: "roles/monitoring.viewer",
            member: pulumi.interpolate `serviceAccount:${this.gkeServiceAccount.email}`, // string interpolation for outputs requires pulumi.interpolate
        }, { parent: this });

        // Create a new random ID for the K8s debugger custom role
        const k8sDebuggerId = new random.RandomId(`k8s-debugger-id`, {
            byteLength: 4,
        }, { parent: this });

        // Create a new custom role for the K8s debugger
        this.k8sDebuggerCustomRole = new gcp.projects.IAMCustomRole(`k8s-debugger`, {
            roleId: `container.debugger.${k8sDebuggerId.hex}`,
            title: "Kubernetes Engine Debugger",
            description: "Additional permissions to debug Kubernetes Engine workloads",
            permissions: [
                "container.pods.exec",
                "container.pods.portForward",
            ],
        }, { parent: this });

        // Export the auth information
        this.k8sDebuggerId = k8sDebuggerId.id;
    }
}

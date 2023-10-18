import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

export interface AuthConfig {
    projectId: pulumi.Input<string>;
    workspace: pulumi.Input<string>;
}

export class Auth extends pulumi.ComponentResource {
    public readonly gkeServiceAccount: gcp.serviceaccount.Account;
    public readonly gkeLoggingIamMember: gcp.projects.IAMMember;
    public readonly gkeMetricsIamMember: gcp.projects.IAMMember;
    public readonly gkeMonitoringIamMember: gcp.projects.IAMMember;
    public readonly k8sDebuggerId: pulumi.Output<string>;
    public readonly k8sDebuggerCustomRole: gcp.projects.IAMCustomRole;

    constructor(name: string, config: AuthConfig, opts?: pulumi.ComponentResourceOptions) {
        // TODO:  super("aptos-node:azure:Auth", name, {}, opts); or type token similar describing what this is doing.
        super("aptos-node:gcp:Auth", name, {}, opts);

        // pulumi.log.debug("XXXXXXXXX")
        // pulumi.log.debug(`GCP Account Name: aptos-${config.workspace}-gke`);
        // pulumi.log.debug("XXXXXXXXX")

        // Create a new GKE service account
        this.gkeServiceAccount = new gcp.serviceaccount.Account(`gke`, {
            accountId: pulumi.interpolate`aptos-${config.workspace}-gke`,
        }, { parent: this });

        const member = pulumi.interpolate`serviceAccount:${this.gkeServiceAccount.email}`

        // Create new IAM members for GKE logging, metrics, and monitoring
        this.gkeLoggingIamMember = new gcp.projects.IAMMember(`gke-logging`, {
            project: config.projectId,
            role: "roles/logging.logWriter",
            member: member,
        }, {
            parent: this
        });

        this.gkeMetricsIamMember = new gcp.projects.IAMMember(`gke-metrics`, {
            project: config.projectId,
            role: "roles/monitoring.metricWriter",
            member: member,
        }, {
            parent: this
        });

        this.gkeMonitoringIamMember = new gcp.projects.IAMMember(`gke-monitoring`, {
            project: config.projectId,
            role: "roles/monitoring.viewer",
            member: member,
        }, {
            parent: this
        });

        // Create a new random ID for the K8s debugger custom role
        const k8sDebuggerId = new random.RandomId(`k8s-debugger-id`, {
            byteLength: 4,
        }, { parent: this });

        // Create a new custom role for the K8s debugger
        this.k8sDebuggerCustomRole = new gcp.projects.IAMCustomRole(`k8s-debugger`, {
            roleId: pulumi.interpolate`container.debugger.${k8sDebuggerId.hex}`,
            title: "Kubernetes Engine Debugger",
            description: "Additional permissions to debug Kubernetes Engine workloads",
            permissions: [
                "container.pods.portForward",
                "container.pods.exec",
            ],
        }, {
            // import: `projects/geoff-miller-pulumi-corp-play/roles/container.debugger.08feee41`,
            parent: this,
            protect: false,
        });

        // Export the auth information
        this.k8sDebuggerId = k8sDebuggerId.id;
    }
}

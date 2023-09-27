import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";

export interface AuthConfig {
    projectId: pulumi.Input<string>;
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
            accountId: "gke",
            project: config.projectId,
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
            member: `serviceAccount:${this.gkeServiceAccount.email}`,
        }, { parent: this });

        // Create a new random ID for the K8s debugger custom role
        const k8sDebuggerId = new random.RandomId(`k8s-debugger-id`, {
            byteLength: 8,
        }, { parent: this });

        // Create a new custom role for the K8s debugger
        this.k8sDebuggerCustomRole = new gcp.projects.IAMCustomRole(`k8s-debugger`, {
            roleId: `k8s-debugger-${k8sDebuggerId.hex}`,
            title: "K8s Debugger",
            description: "Custom role for K8s debugger",
            permissions: [
                "logging.logEntries.list",
                "logging.logEntries.create",
                "logging.logEntries.delete",
                "logging.logEntries.list",
                "logging.logEntries.update",
                "logging.logEntries.write",
                "logging.logs.list",
                "logging.sinks.create",
                "logging.sinks.delete",
                "logging.sinks.get",
                "logging.sinks.list",
                "logging.sinks.update",
                "monitoring.alertPolicies.create",
                "monitoring.alertPolicies.delete",
                "monitoring.alertPolicies.get",
                "monitoring.alertPolicies.list",
                "monitoring.alertPolicies.update",
                "monitoring.dashboards.create",
                "monitoring.dashboards.delete",
                "monitoring.dashboards.get",
                "monitoring.dashboards.list",
                "monitoring.dashboards.update",
                "monitoring.groups.create",
                "monitoring.groups.delete",
                "monitoring.groups.get",
                "monitoring.groups.list",
                "monitoring.groups.update",
                "monitoring.metricDescriptors.create",
                "monitoring.metricDescriptors.delete",
                "monitoring.metricDescriptors.get",
                "monitoring.metricDescriptors.list",
                "monitoring.metricDescriptors.update",
                "monitoring.metricDescriptors.update",
                "monitoring.monitoredResourceDescriptors.get",
                "monitoring.monitoredResourceDescriptors.list",
                "monitoring.notificationChannelDescriptors.get",
                "monitoring.notificationChannelDescriptors.list",
                "monitoring.notificationChannels.create",
                "monitoring.notificationChannels.delete",
                "monitoring.notificationChannels.get",
                "monitoring.notificationChannels.list",
                "monitoring.notificationChannels.update",
                "monitoring.notificationChannels.update",
                "monitoring.publicWidgets.create",
                "monitoring.publicWidgets.delete",
                "monitoring.publicWidgets.get",
                "monitoring.publicWidgets.list",
                "monitoring.publicWidgets.update",
                "monitoring.publicWidgets.update",
                "monitoring.timeSeries.create",
                "monitoring.timeSeries.list",
                "monitoring.timeSeries.update",
                "monitoring.timeSeries.update",
                "monitoring.uptimeCheckConfigs.create",
                "monitoring.uptimeCheckConfigs.delete",
                "monitoring.uptimeCheckConfigs.get",
                "monitoring.uptimeCheckConfigs.list",
                "monitoring.uptimeCheckConfigs.update",
                "monitoring.uptimeCheckIps.list",
            ],
        }, { parent: this });

        // Export the auth information
        this.k8sDebuggerId = k8sDebuggerId.id;
        this.registerOutputs({
            gkeServiceAccountEmail: this.gkeServiceAccount.email,
            gkeLoggingIamMemberName: this.gkeLoggingIamMember.member,
            gkeMetricsIamMemberName: this.gkeMetricsIamMember.member,
            gkeMonitoringIamMemberName: this.gkeMonitoringIamMember.member,
            k8sDebuggerCustomRoleId: this.k8sDebuggerCustomRole.roleId,
        });
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as helm from "@pulumi/kubernetes/helm/v3";

export interface KubernetesConfig {
    namespace: pulumi.Input<string>;
}

export class Kubernetes extends pulumi.ComponentResource {
    public readonly ssdStorageClass: k8s.storage.v1.StorageClass;
    public readonly validatorHelmRelease: helm.v3.Release;
    public readonly loggerHelmRelease: helm.v3.Release;
    public readonly monitoringHelmRelease: helm.v3.Release;
    public readonly nodeExporterHelmRelease: helm.v3.Release;

    constructor(name: string, config: KubernetesConfig, opts?: pulumi.ComponentResourceOptions) {
        super("my:kubernetes:Kubernetes", name, {}, opts);

        // Create a new SSD storage class
        this.ssdStorageClass = new k8s.storage.v1.StorageClass(`ssd`, {
            metadata: {
                name: "ssd",
            },
            provisioner: "kubernetes.io/gce-pd",
            parameters: {
                type: "pd-ssd",
            },
        }, { parent: this });

        // Create new Helm releases for the validator, logger, monitoring, and node exporter
        this.validatorHelmRelease = new helm.v3.Release(`validator`, {
            chart: "validator",
            version: "1.0.0",
            namespace: config.namespace,
        }, { parent: this });

        this.loggerHelmRelease = new helm.v3.Release(`logger`, {
            chart: "logger",
            version: "1.0.0",
            namespace: config.namespace,
        }, { parent: this });

        this.monitoringHelmRelease = new helm.v3.Release(`monitoring`, {
            chart: "monitoring",
            version: "1.0.0",
            namespace: config.namespace,
        }, { parent: this });

        this.nodeExporterHelmRelease = new helm.v3.Release(`node-exporter`, {
            chart: "node-exporter",
            version: "1.0.0",
            namespace: config.namespace,
        }, { parent: this });

        // Export the Kubernetes information
        this.registerOutputs({
            ssdStorageClassName: this.ssdStorageClass.metadata.name,
            validatorHelmReleaseName: this.validatorHelmRelease.name,
            loggerHelmReleaseName: this.loggerHelmRelease.name,
            monitoringHelmReleaseName: this.monitoringHelmRelease.name,
            nodeExporterHelmReleaseName: this.nodeExporterHelmRelease.name,
        });
    }
}

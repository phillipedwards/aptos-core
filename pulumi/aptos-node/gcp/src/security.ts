import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export interface SecurityConfig { }

export class Security extends pulumi.ComponentResource {
    // public readonly pssDefaultLabels: k8s.core.v1.Namespace;

    constructor(name: string, config: SecurityConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:Security", name, {}, opts);

        const privilegedPssLabels = {
            "pod-security.kubernetes.io/audit": "baseline",
            "pod-security.kubernetes.io/warn": "baseline",
            "pod-security.kubernetes.io/enforce": "privileged",
        };
        // TODO: ask about this
        // this.pssDefaultLabels = new k8s.core.v1.Namespace("default", {
        //     metadata: {
        //         name: "default",
        //         labels: privilegedPssLabels,
        //     },
        // });
    }
}

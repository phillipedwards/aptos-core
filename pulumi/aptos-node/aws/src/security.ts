// import * as pulumi from "@pulumi/pulumi";
// import * as k8s from "@pulumi/kubernetes";
// import * as awsNative from "@pulumi/aws-native";

// export interface SecurityConfig {
//     namespace: string;
// }

// export class Security extends pulumi.ComponentResource {
//     public readonly disablePspRoleBinding: k8s.rbac.v1.RoleBinding;
//     public readonly deletePspAuthenticatedNullResource: pulumi.Resource;
//     public readonly pssDefaultLabels: k8s.core.v1.Namespace;

//     constructor(name: string, args: SecurityConfig, opts?: pulumi.ComponentResourceOptions) {
//         super("aptos-node:aws:Security", name, {}, opts);

//         const namespace = new k8s.core.v1.Namespace(`namespace`, {
//             metadata: {
//                 name: args.namespace,
//             },
//         }, { parent: this });

//         this.disablePspRoleBinding = new k8s.rbac.v1.RoleBinding(`disable-psp`, {
//             metadata: {
//                 name: "disable-psp",
//                 namespace: namespace.metadata.name,
//             },
//             roleRef: {
//                 apiGroup: "rbac.authorization.k8s.io",
//                 kind: "ClusterRole",
//                 name: "psp:privileged",
//             },
//             subjects: [
//                 {
//                     kind: "Group",
//                     name: "system:authenticated",
//                 },
//             ],
//         }, { parent: this });

//         this.deletePspAuthenticatedNullResource = new pulumi.Resource(`delete-psp-authenticated`, {
//             dependsOn: this.disablePspRoleBinding,
//         }, { parent: this });

//         this.pssDefaultLabels = new k8s.core.v1.Namespace(`pss-default-labels`, {
//             metadata: {
//                 name: namespace.metadata.name,
//                 labels: {
//                     "pss-default": "true",
//                 },
//             },
//         }, { parent: this });

//         this.registerOutputs({
//             disablePspRoleBinding: this.disablePspRoleBinding,
//             deletePspAuthenticatedNullResource: this.deletePspAuthenticatedNullResource,
//             pssDefaultLabels: this.pssDefaultLabels,
//         });
//     }
// }

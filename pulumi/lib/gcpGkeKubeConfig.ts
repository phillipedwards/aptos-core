import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as k8sClientLib from '@kubernetes/client-node';
import { ResourceOptions } from "@pulumi/pulumi";

interface KubeconfigForGkeArgs {
    GkeCluster: gcp.container.Cluster,
}

export function getKubeconfigFromGkeCluster(args: KubeconfigForGkeArgs): pulumi.Output<k8sClientLib.KubeConfig> {
    // pulumi example for creating a k8s kubeconfig:: https://github.com/pulumi/pulumi-self-hosted-installers/blob/master/gke-hosted/02-kubernetes/cluster.ts
    return pulumi.all([
        args.GkeCluster.name,
        args.GkeCluster.endpoint,
        args.GkeCluster.masterAuth
    ]).apply(([name, endpoint, masterAuth]) => {
        const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
        const kubeconfigBuilder = new k8sClientLib.KubeConfig();
        kubeconfigBuilder.loadFromOptions({
            clusters: [
                {
                    name: context,
                    server: `https://${endpoint}`,
                    caData: masterAuth.clusterCaCertificate,
                },
            ],
            contexts: [
                {
                    name: context,
                    cluster: context,
                    user: context,
                },
            ],
            currentContext: context,
            users: [
                {
                    name: context,
                    authProvider: undefined,
                    exec: {
                        apiVersion: "client.authentication.k8s.io/v1beta1",
                        command: "gke-gcloud-auth-plugin",
                        installHint: "Install gke-gcloud-auth-plugin for use with kubectl by following " +
                            "https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke",
                        provideClusterInfo: true,
                    },
                },
            ],
        });
        return kubeconfigBuilder;
    });
}

export function getK8sProviderFromGkeCluster(args: KubeconfigForGkeArgs, opts?: ResourceOptions): k8s.Provider {
    return new k8s.Provider(`k8s`, {
        kubeconfig: getKubeconfigFromGkeCluster({
            GkeCluster: args.GkeCluster,
        }).apply(kubeconfig => kubeconfig.exportConfig()),
    }, opts);
}

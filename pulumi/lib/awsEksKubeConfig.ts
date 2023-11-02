import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as k8sClientLib from '@kubernetes/client-node';
import { ResourceOptions } from "@pulumi/pulumi";

interface KubeconfigForEksArgs {
    eksCluster: aws.eks.Cluster,
    region: pulumi.Input<string>,
    accountId: pulumi.Input<string>,
}

export function getKubeconfigFromEksCluster(args: KubeconfigForEksArgs): pulumi.Output<k8sClientLib.KubeConfig> {
    return pulumi.all([
        args.eksCluster.name,
        args.eksCluster.endpoint,
        args.eksCluster.certificateAuthority.data,
        args.region,
        args.accountId,
    ]).apply(([name, endpoint, caData, region, accountId]) => {
        const context = `arn:aws:eks:${region}:${accountId}:cluster/${name}`;
        const kubeconfigBuilder = new k8sClientLib.KubeConfig();
        kubeconfigBuilder.loadFromOptions({
            clusters: [
                {
                    name: context,
                    server: endpoint,
                    caData: caData,
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
                        command: "aws",
                        installHint: "Install the aws cli",
                        args: [
                            "--region",
                            region,
                            "eks",
                            "get-token",
                            "--cluster-name",
                            name,
                        ],
                    },
                },
            ],
        });
        return kubeconfigBuilder;
    });
}

export function getK8sProviderFromEksCluster(args: KubeconfigForEksArgs, opts?: ResourceOptions): k8s.Provider {
    return new k8s.Provider(`k8s`, {
        kubeconfig: getKubeconfigFromEksCluster({
            eksCluster: args.eksCluster,
            region: args.region,
            accountId: args.accountId,
        }).apply(kubeconfig => kubeconfig.exportConfig()),
    }, opts);
}

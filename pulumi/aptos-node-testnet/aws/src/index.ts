import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as std from "@pulumi/std";
import * as aconfig from "./config";
import { AptosNodeAWS } from "../../../aptos-node/aws/src/aptosNodeAWS";
import * as transformations from './transformation';
import * as crypto from "crypto";
import * as fs from "fs";
import { computeSha1ForHelmRelease } from "../../../lib/helpers"

type AptosNodeHelmValues = {
    fullnode?: {
        groups?: string[],
    },
};

// Register the alias transformation on the stack to import from `pulumi import from...`
pulumi.log.info(`Registering aliasTransformation transformation`);
pulumi.runtime.registerStackTransformation(transformations.aliasTransformation);
// Register the addImports transformation on the stack to import from other state
pulumi.log.info(`Registering addImports transformation`);
pulumi.runtime.registerStackTransformation(transformations.addImports);
// pulumi.log.info(`Registering commonTags transformation`);
// pulumi.runtime.registerStackTransformation(transformations.commonTags);
// pulumi.runtime.registerStackTransformation(transformations.isTaggableAWS);
pulumi.log.info(`Registering setAWSProviderOnEachAWSResource transformation`);
pulumi.runtime.registerStackTransformation(transformations.setAWSProviderOnEachAWSResource);

export const config = new pulumi.Config();
// AWS region
export const region: pulumi.Input<string> = config.requireObject("region");
// TEST ONLY: Whether to maximize the capacity of the cluster by allocating a large CIDR block to the first AZ
export const maximizeSingleAzCapacity: pulumi.Input<boolean> = config.getBoolean("maximizeSingleAzCapacity") || false;
// Route53 Zone ID to create records in
export const zoneId: pulumi.Input<string> = config.get("zoneId") || "";
// If specified, overrides the usage of Terraform workspace for naming purposes
export const workspaceNameOverride: pulumi.Input<string> = config.get("workspaceNameOverride") || "";
// List of Subject Alternate Names to include in TLS certificate
export const tlsSans: pulumi.Input<string>[] = config.getObject<Array<string>>("tlsSans") || [];
// Include Terraform workspace name in DNS records
export const workspaceDns: pulumi.Input<boolean> = config.getBoolean("workspaceDns") || true;
// Path to use when naming IAM objects
export const iamPath: pulumi.Input<string> = config.get("iamPath") || "/";
// ARN of IAM policy to set as permissions boundary on created roles
export const permissionsBoundaryPolicy: pulumi.Input<string> = config.get("permissionsBoundaryPolicy") || "";
// List of CIDR subnets which can access Kubernetes API
export const adminSourcesIpv4: pulumi.Input<string>[] = config.getObject<Array<string>>("adminSourcesIpv4") || ["0.0.0.0/0"];
// List of CIDR subnets which can access the testnet API
export const clientSourcesIpv4: pulumi.Input<string>[] = config.getObject<Array<string>>("clientSourcesIpv4") || ["0.0.0.0/0"];
// List of AWS roles to configure as Kubernetes administrators
export const k8sAdminRoles: pulumi.Input<string>[] = config.getObject<Array<string>>("k8sAdminRoles") || [];
// List of AWS usernames to configure as Kubernetes administrators
export const k8sAdmins: pulumi.Input<string>[] = config.getObject<Array<string>>("k8sAdmins") || [];
// Aptos chain ID. If var.enable_forge set, defaults to 4
export const chainId: pulumi.Input<string> = config.get("chainId") || "4";
// Chain era, used to start a clean chain
export const era: pulumi.Input<number> = config.getNumber("era") || 15;
// Aptos chain name. If unset, defaults to using the workspace name
export const chainName: pulumi.Input<string> = config.get("chainName") || "";
// Docker image tag for all Aptos workloads, including validators, fullnodes, backup, restore, genesis, and other tooling
export const imageTag: pulumi.Input<string> = config.get("imageTag") || "devnet";
// Docker image tag for validators and fullnodes. If set, overrides var.image_tag for those nodes
export const validatorImageTag: pulumi.Input<string> = config.get("validatorImageTag") || "";
// Map of values to pass to aptos-node helm chart
export const aptosNodeHelmValues: pulumi.Input<AptosNodeHelmValues> = config.getObject<AptosNodeHelmValues>("aptosNodeHelmValues") || {};
// Map of values to pass to genesis helm chart
export const genesisHelmValues: pulumi.Input<object> = config.getObject("genesisHelmValues") || {};
// Map of values to pass to logger helm chart
export const loggerHelmValues: pulumi.Input<object> = config.getObject("loggerHelmValues") || {};
// Enable monitoring helm chart
export const enableMonitoring: pulumi.Input<boolean> = config.getBoolean("enableMonitoring") || false;
// Map of values to pass to monitoring helm chart
export const monitoringHelValues: pulumi.Input<object> = config.getObject("monitoringHelmValues") || {};
// Enable prometheus-node-exporter within monitoring helm chart
export const enablePrometheusNodeExporter: pulumi.Input<boolean> = config.getBoolean("enablePrometheusNodeExporter") || false;
// Enable kube-state-metrics within monitoring helm chart
export const enableKubeStateMetrics: pulumi.Input<boolean> = config.getBoolean("enableKubeStateMetrics") || false;
// Map of values to pass to testnet-addons helm chart
export const testnetAddonsHelmValues: pulumi.Input<object> = config.getObject("testnetAddonsHelmValues") || {};
// Enable node-health-checker
export const enableNodeHealthChecker: pulumi.Input<boolean> = config.getBoolean("enableNodeHealthChecker") || false;
// Map of values to pass to node-health-checker helm chart
export const nodeHealthCheckerHelmValues: pulumi.Input<object> = config.getObject("nodeHealthCheckerHelmValues") || {};
// The number of validator nodes to create
export const numValidators: pulumi.Input<number> = config.getNumber("numValidators") || 4;
// The number of fullnode groups to create
export const numFullnodeGroups: pulumi.Input<number> = config.getNumber("numFullnodeGroups") || 1;
// Number of instances for utilities node pool, when it's 0, it will be set to var.num_validators
export const numUtilityInstance: pulumi.Input<number> = config.getNumber("numUtilityInstance") || 0;
// Number of instances for validator node pool, when it's 0, it will be set to 2 * var.num_validators
export const numValidatorInstance: pulumi.Input<number> = config.getNumber("numValidatorInstance") || 0;
// Maximum number of instances for utilities. If left 0, defaults to 2 * var.num_validators
export const utilityInstanceMaxNum: pulumi.Input<number> = config.getNumber("utilityInstanceMaxNum") || 0;
// Minimum number of instances for utilities.
export const utilityInstanceMinNum: pulumi.Input<number> = config.getNumber("utilityInstanceMinNum") || 0;
export const utilityInstanceEnableTaint: pulumi.Input<boolean> = config.getBoolean("utilityInstanceEnableTaint") || false;
// Maximum number of instances for utilities. If left 0, defaults to 2 * var.num_validators
export const validatorInstanceMaxNum: pulumi.Input<number> = config.getNumber("validatorInstanceMaxNum") || 0;
export const validatorInstanceEnableTaint: pulumi.Input<boolean> = config.getBoolean("validatorInstanceEnableTaint") || false;
// Minimum number of instances for validators.
export const validatorInstanceMinNum: pulumi.Input<number> = config.getNumber("validatorInstanceMinNum") || 0;
// Instance type used for utilities
export const utilityInstanceType: pulumi.Input<string> = config.get("utilityInstanceType") || "t3.2xlarge";
// Instance type used for validator and fullnodes
export const validatorInstanceType: pulumi.Input<string> = config.get("validatorInstanceType") || "c6i.4xlarge";
// Enable Forge test framework, also creating an internal helm repo
export const enableForge: pulumi.Input<boolean> = config.getBoolean("enableForge") || false;
// S3 bucket in which Forge config is stored
export const forgeConfigS3Bucket: pulumi.Input<string> = config.get("forgeConfigS3Bucket") || "forge-wrapper-config";
// Map of values to pass to Forge Helm
export const forgeHelmValues: pulumi.Input<object> = config.getObject("forgeHelmValues") || {};
// Which storage class to use for the validator and fullnode
export const validatorStorageClass: pulumi.Input<string> = config.get("validatorStorageClass") || "io1";
// Which storage class to use for the validator and fullnode
export const fullnodeStorageClass: pulumi.Input<string> = config.get("fullnodeStorageClass") || "io1";
// Whether to manage the aptos-node k8s workload via Terraform. If set to false, the helm_release resource will still be created and updated when values change, but it may not be updated on every apply
export const manageViaPulumi: pulumi.Input<boolean> = config.getBoolean("manageViaPulumi") || true;
export const vpcCidrBlock: pulumi.Input<string> = config.get("vpcCidrBlock") || "192.168.0.0/16" as string;
export const azs: pulumi.Input<string>[] = config.requireObject<Array<pulumi.Input<string>>>("azs");

const workspaceName = workspaceNameOverride || pulumi.getStack();

const dnsPrefix = workspaceDns ? pulumi.interpolate`${workspaceName}.` : pulumi.interpolate``;

let domain = pulumi.interpolate``;
let awsAcmCertForIngress = undefined
let route53Zone = undefined

const genesisHelmChartPath = std.abspath({ input: "../../helm/genesis" });
const autoscalingHelmChartPath = std.abspath({ input: "../../helm/autoscaling" });
const chaosMeshHelmChartPath = std.abspath({ input: "../../helm/chaos" });
const testnetAddonsHelmChartPath = std.abspath({ input: "../../helm/testnet-addons" });
const nodeHealthCheckerHelmChartPath = std.abspath({ input: "../../helm/node-health-checker" });
const forgeHelmChartPath = std.abspath({ input: "../../helm/forge" });

// DNS
if (zoneId) {
    route53Zone = aws.route53.getZoneOutput({ zoneId });

    domain = pulumi.interpolate`${dnsPrefix}${route53Zone.name}`;

    awsAcmCertForIngress = new aws.acm.Certificate(`ingress`, {
        domainName: domain,
        subjectAlternativeNames: std.concatOutput({
            input: [
                [`${domain}`],
                tlsSans,
            ],
        }).apply(invoke => invoke.result),
        validationMethod: "DNS",
        tags: {
            terraform: "testnet",
            workspace: workspaceName,
        },
    });

    const acmValidationRecordsForIngress = awsAcmCertForIngress.domainValidationOptions.apply(domainValidationOptions => {
        return domainValidationOptions.reduce((__obj, dvo) => ({ ...__obj, [dvo.domainName]: dvo }));
    }).apply(rangeBody => {

        const ingressAcmValidationRecords = [];

        for (const range of Object.entries(rangeBody).map(([k, v]) => ({ key: k, value: v }))) {
            ingressAcmValidationRecords.push(new aws.route53.Record(`ingress-acm-validation-${range.key}`, {
                zoneId,
                allowOverwrite: true,
                name: range.value.resourceRecordName,
                type: range.value.resourceRecordType,
                records: [range.value.resourceRecordValue],
                ttl: 60,
            }));
        }
        return ingressAcmValidationRecords;
    });

    const acmValidationForIngress = new aws.acm.CertificateValidation(`ingress`, {
        certificateArn: awsAcmCertForIngress.arn,
        validationRecordFqdns: awsAcmCertForIngress.domainValidationOptions.apply(domainValidationOptions => domainValidationOptions.map(dvo => (dvo.resourceRecordName))),
    });
}

// 

const currentAwsCallerIdentity = aws.getCallerIdentityOutput({});
const currentAwsAccountId = currentAwsCallerIdentity.accountId;
const awsTagsMap: pulumi.Input<object> = {
    "pulumi/organziation": pulumi.getOrganization(),
    "pulumi/project": pulumi.getProject(),
    "pulumi/stack": pulumi.getStack(),
}
const mychainName = chainName != "" ? pulumi.interpolate`${chainName}` : pulumi.interpolate`${workspaceName}net`;
const mychainId = enableForge ? 4 : chainId;

const validator = new AptosNodeAWS("validator", {
    region: region,
    dnsConfig: {
        hostedZoneId: zoneId,
    },
    authConfig: {
        iamPath: iamPath,
        permissionsBoundaryPolicy: permissionsBoundaryPolicy,
    },
    networkConfig: {
        azs: azs,
        maximizeSingleAzCapacity: maximizeSingleAzCapacity,
        vpcCidrBlock: vpcCidrBlock,
    },
    clusterConfig: {
        k8sApiSources: adminSourcesIpv4,
        utilitiesNodePool: {
            instanceType: utilityInstanceType,
            instanceMinNum: utilityInstanceMinNum,
            instanceMaxNum: utilityInstanceMaxNum,
            instanceNum: numUtilityInstance,
            instanceEnableTaint: utilityInstanceEnableTaint,
        },
        validatorsNodePool: {
            instanceType: validatorInstanceType,
            instanceMinNum: validatorInstanceMinNum,
            instanceMaxNum: validatorInstanceMaxNum,
            instanceNum: numValidatorInstance,
            instanceEnableTaint: validatorInstanceEnableTaint,
        },
    },
    kubernetesConfig: {
        chainId: chainId,
        chainName: chainName,
        era: era,
        iamPath: iamPath,
        imageTag: imageTag,
        k8sAdminRoles: k8sAdminRoles,
        k8sAdmins: k8sAdmins,
        manageViaPulumi: manageViaPulumi,
        numFullnodeGroups: numFullnodeGroups,
        numValidators: numValidators,
        validatorName: "aptos-node",
        validatorStorageClass: validatorStorageClass,
        enableKubeStateMetrics: enableKubeStateMetrics,
    },
});

const aptosNodeHelmPrefix = enableForge ? "aptos-node" : pulumi.interpolate`${validator.helmReleaseName}-aptos-node`;



const helmReleaseForGenesis = new k8s.helm.v3.Release("genesis", {
    name: "genesis",
    chart: genesisHelmChartPath.then(genesisHelmChartPath => genesisHelmChartPath.result),
    maxHistory: 5,
    waitForJobs: false,
    values: {
        imageTag: imageTag,
        chain: {
            name: mychainName,
            era: era,
            chainId: mychainId,
        },
        genesis: {
            numValidators: numValidators,
            usernamePrefix: aptosNodeHelmPrefix,
            domain: domain,
            validator: {
                enableOnchainDiscovery: false,
            },
            fullnode: {
                enableOnchainDiscovery: zoneId != "",
            },
        },
        ...genesisHelmValues,
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            genesisHelmChartPath
        ).digest('hex') : "",
    },
});

const iamDocForExternalDnsRt53 = aws.iam.getPolicyDocumentOutput({
    statements: [
        {
            actions: [
                "route53:ChangeResourceRecordSets",
                "route53:ListResourceRecordSets",
            ],
            resources: [`arn:aws:route53:::hostedzone/${zoneId}`],
        },
        {
            actions: ["route53:ListHostedZones"],
            resources: ["*"],
        },
    ],
});

const albIngress = aws.iam.getPolicyDocumentOutput({
    statements: [
        {
            effect: "Allow",
            actions: [
                "acm:DescribeCertificate",
                "acm:ListCertificates",
                "acm:GetCertificate",
            ],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:CreateSecurityGroup",
                "ec2:CreateTags",
                "ec2:DeleteTags",
                "ec2:DeleteSecurityGroup",
                "ec2:DescribeAccountAttributes",
                "ec2:DescribeAddresses",
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
                "ec2:DescribeInternetGateways",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeSubnets",
                "ec2:DescribeTags",
                "ec2:DescribeVpcs",
                "ec2:ModifyInstanceAttribute",
                "ec2:ModifyNetworkInterfaceAttribute",
                "ec2:RevokeSecurityGroupIngress",
            ],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: [
                "elasticloadbalancing:AddListenerCertificates",
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:CreateListener",
                "elasticloadbalancing:CreateLoadBalancer",
                "elasticloadbalancing:CreateRule",
                "elasticloadbalancing:CreateTargetGroup",
                "elasticloadbalancing:DeleteListener",
                "elasticloadbalancing:DeleteLoadBalancer",
                "elasticloadbalancing:DeleteRule",
                "elasticloadbalancing:DeleteTargetGroup",
                "elasticloadbalancing:DeregisterTargets",
                "elasticloadbalancing:DescribeListenerCertificates",
                "elasticloadbalancing:DescribeListeners",
                "elasticloadbalancing:DescribeLoadBalancers",
                "elasticloadbalancing:DescribeLoadBalancerAttributes",
                "elasticloadbalancing:DescribeRules",
                "elasticloadbalancing:DescribeSSLPolicies",
                "elasticloadbalancing:DescribeTags",
                "elasticloadbalancing:DescribeTargetGroups",
                "elasticloadbalancing:DescribeTargetGroupAttributes",
                "elasticloadbalancing:DescribeTargetHealth",
                "elasticloadbalancing:ModifyListener",
                "elasticloadbalancing:ModifyLoadBalancerAttributes",
                "elasticloadbalancing:ModifyRule",
                "elasticloadbalancing:ModifyTargetGroup",
                "elasticloadbalancing:ModifyTargetGroupAttributes",
                "elasticloadbalancing:RegisterTargets",
                "elasticloadbalancing:RemoveListenerCertificates",
                "elasticloadbalancing:RemoveTags",
                "elasticloadbalancing:SetIpAddressType",
                "elasticloadbalancing:SetSecurityGroups",
                "elasticloadbalancing:SetSubnets",
                "elasticloadbalancing:SetWebACL",
            ],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: [
                "iam:CreateServiceLinkedRole",
                "iam:GetServerCertificate",
                "iam:ListServerCertificates",
            ],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: ["cognito-idp:DescribeUserPoolClient"],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: [
                "waf-regional:GetWebACLForResource",
                "waf-regional:GetWebACL",
                "waf-regional:AssociateWebACL",
                "waf-regional:DisassociateWebACL",
            ],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: [
                "tag:GetResources",
                "tag:TagResources",
            ],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: ["waf:GetWebACL"],
            resources: ["*"],
        },
        {
            effect: "Allow",
            actions: [
                "wafv2:GetWebACL",
                "wafv2:GetWebACLForResource",
                "wafv2:AssociateWebACL",
                "wafv2:DisassociateWebACL",
            ],
            resources: ["*"],
        },
    ],
});

const k8sAwsIntegrationsAssumeRole = aws.iam.getPolicyDocumentOutput({
    statements: [{
        actions: ["sts:AssumeRoleWithWebIdentity"],
        principals: [{
            type: "Federated",
            identifiers: [pulumi.all([currentAwsCallerIdentity, validator.openidConnectProvider]).apply(([current, oidcProvider]) => `arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
        }],
        conditions: [
            {
                test: "StringEquals",
                variable: pulumi.interpolate`${validator.openidConnectProvider}:sub`,
                values: ["system:serviceaccount:kube-system:k8s-aws-integrations"],
            },
            {
                test: "StringEquals",
                variable: pulumi.interpolate`${validator.openidConnectProvider}:aud`,
                values: ["sts.amazonaws.com"],
            },
        ],
    }],
});

const k8sAwsIntegrationsResource = new aws.iam.Role("k8s-aws-integrations", {
    name: pulumi.interpolate`${workspaceName}-k8s-aws-integrations`,
    path: iamPath,
    assumeRolePolicy: k8sAwsIntegrationsAssumeRole.apply(k8sAwsIntegrationsAssumeRole => k8sAwsIntegrationsAssumeRole.json),
    permissionsBoundary: permissionsBoundaryPolicy,
    tags: {
        terraform: "testnet",
        workspace: workspaceName,
    },
});

const k8sAwsIntegrationsResource2: aws.iam.RolePolicy[] = [];

for (const range = { value: 0 }; range.value < (zoneId != "" ? 1 : 0); range.value++) {
    k8sAwsIntegrationsResource2.push(new aws.iam.RolePolicy(`k8s-aws-integrations-${range.value}`, {
        name: "externalDns",
        role: k8sAwsIntegrationsResource.name,
        policy: iamDocForExternalDnsRt53.apply(externalDns => externalDns.json),
    }));
}

const albIngressResource = new aws.iam.RolePolicy("albIngress", {
    name: "EKS-Ingress",
    role: k8sAwsIntegrationsResource.name,
    policy: albIngress.apply(albIngress => albIngress.json),
});

const clusterAutoscalerAssumeRole = aws.iam.getPolicyDocumentOutput({
    statements: [{
        actions: ["sts:AssumeRoleWithWebIdentity"],
        principals: [{
            type: "Federated",
            identifiers: [pulumi.all([currentAwsCallerIdentity, validator.openidConnectProvider]).apply(([current, oidcProvider]) => `arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
        }],
        conditions: [
            {
                test: "StringEquals",
                variable: pulumi.interpolate`${validator.openidConnectProvider}:sub`,
                values: ["system:serviceaccount:kube-system:clusterAutoscaler"],
            },
            {
                test: "StringEquals",
                variable: pulumi.interpolate`${validator.openidConnectProvider}:aud`,
                values: ["sts.amazonaws.com"],
            },
        ],
    }],
});

const clusterAutoscalerResource = new aws.iam.Role("clusterAutoscaler", {
    name: pulumi.interpolate`aptos-node-testnet-${workspaceName}-clusterAutoscaler`,
    path: iamPath,
    permissionsBoundary: permissionsBoundaryPolicy,
    assumeRolePolicy: clusterAutoscalerAssumeRole.apply(clusterAutoscalerAssumeRole => clusterAutoscalerAssumeRole.json),
});

const autoscaling = new k8s.helm.v3.Release("autoscaling", {
    name: "autoscaling",
    namespace: "kube-system",
    chart: autoscalingHelmChartPath.then(autoscalingHelmChartPath => autoscalingHelmChartPath.result),
    maxHistory: 5,
    waitForJobs: false,
    values: {
        coredns: {
            maxReplicas: numValidators,
        },
        "metrics-server": {
            resources: {
                requests: {
                    cpu: validatorInstanceMaxNum > 0 ? `${validatorInstanceMaxNum}m` : undefined,
                    memory: validatorInstanceMaxNum > 0 ? `${validatorInstanceMaxNum * 2}Mi` : undefined,
                },
            },
        },
        autoscaler: {
            enabled: true,
            clusterName: validator.awsEksCluster?.name,
            image: {
                tag: `v${validator.awsEksCluster?.version}.0`,
            },
            serviceAccount: {
                annotations: {
                    "eks.amazonaws.com/role-arn": clusterAutoscalerResource.arn,
                },
            },
        },
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            autoscalingHelmChartPath
        ).digest('hex') : "",
    },
});

const iamDocForClusterAutoscaler = aws.iam.getPolicyDocumentOutput({
    statements: [
        {
            sid: "Autoscaling",
            actions: [
                "autoscaling:SetDesiredCapacity",
                "autoscaling:TerminateInstanceInAutoScalingGroup",
            ],
            resources: ["*"],
            conditions: [{
                test: "StringEquals",
                variable: pulumi.interpolate`aws:ResourceTag/k8s.io/clusterAutoscaler/${validator.awsEksCluster?.name}`,
                values: ["owned"],
            }],
        },
        {
            sid: "DescribeAutoscaling",
            actions: [
                "autoscaling:DescribeAutoScalingGroups",
                "autoscaling:DescribeAutoScalingInstances",
                "autoscaling:DescribeLaunchConfigurations",
                "autoscaling:DescribeScalingActivities",
                "autoscaling:DescribeTags",
                "ec2:DescribeInstanceTypes",
                "ec2:DescribeLaunchTemplateVersions",
                "ec2:DescribeImages",
                "ec2:GetInstanceTypesFromInstanceRequirements",
                "eks:DescribeNodegroup",
            ],
            resources: ["*"],
        },
    ],
});

const iamRolePolicyForClusterAutoscaler = new aws.iam.RolePolicy("clusterAutoscaler", {
    name: "Helm",
    role: clusterAutoscalerResource.name,
    policy: iamDocForClusterAutoscaler.apply(clusterAutoscaler => clusterAutoscaler.json),
});

const k8sNamesapceChaosMesh = new k8s.core.v1.Namespace("chaos-mesh", {
    metadata: {
        annotations: {
            name: "chaos-mesh",
        },
        name: "chaos-mesh",
    }
});

const helmReleaseForChaosMesh = new k8s.helm.v3.Release("chaos-mesh", {
    name: "chaos-mesh",
    namespace: k8sNamesapceChaosMesh.metadata.name,
    chart: chaosMeshHelmChartPath.then(chaosMeshHelmChartPath => chaosMeshHelmChartPath.result),
    maxHistory: 5,
    waitForJobs: false,
    values: {
        ingress: {
            enable: zoneId ? true : false,
            domain: zoneId ? pulumi.interpolate`chaos.${domain}` : "",
            acmCertificate: awsAcmCertForIngress ? awsAcmCertForIngress.id : undefined,
            loadBalancerSourceRanges: std.joinOutput({
                separator: ",",
                input: clientSourcesIpv4,
            }).result,
            awsTags: awsTagsMap,
        },
        "chaos-mesh": {
            chaosDaemon: {
                tolerations: [{
                    key: "aptos.org/nodepool",
                    value: "validators",
                    effect: "NoExecute",
                }],
            },
        },
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            chaosMeshHelmChartPath
        ).digest('hex') : "",
    },
});

// service account used for all external AWS-facing services, such as ALB ingress controller and externalDns
const k8sSaForK8sAwsIntegrations = new k8s.core.v1.ServiceAccount("k8s-aws-integrations", {
    metadata: {
        name: "k8s-aws-integrations",
        namespace: "kube-system",
        annotations: {
            "eks.amazonaws.com/role-arn": k8sAwsIntegrationsResource.arn,
        },
    }
});

// when upgrading the AWS ALB ingress controller, update the CRDs as well using:
// kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller/crds?ref=master"
const helmReleaseForAwsLBController = new k8s.helm.v3.Release("aws-load-balancer-controller", {
    name: "aws-load-balancer-controller",
    repositoryOpts: {
        repo: "https://aws.github.io/eks-charts",
    },
    chart: "aws-load-balancer-controller",
    version: "1.4.3",
    namespace: "kube-system",
    maxHistory: 5,
    waitForJobs: false,
    values: [JSON.stringify({
        serviceAccount: {
            create: false,
            name: k8sSaForK8sAwsIntegrations.metadata.name,
        },
        clusterName: validator.awsEksCluster?.name,
        region: region,
        vpcId: validator.vpcId,
    })],
});

if (zoneId) {
    const hemlReleaseForExternalDns = new k8s.helm.v3.Release(`externalDns`, {
        name: "externalDns",
        repositoryOpts: {
            repo: "https://kubernetes-sigs.github.io/externalDns",
        },
        chart: "externalDns",
        version: "1.11.0",
        namespace: "kube-system",
        maxHistory: 5,
        waitForJobs: false,
        values: [JSON.stringify({
            serviceAccount: {
                create: false,
                name: k8sSaForK8sAwsIntegrations.metadata.name,
            },
            domainFilters: (route53Zone) ? [route53Zone.name] : [],
            txtOwnerId: zoneId,
        })],
    });
}

if (enableForge) {
    const helmReleaseForTestnetAddons = new k8s.helm.v3.Release(`testnet-addons`, {
        name: "testnet-addons",
        chart: testnetAddonsHelmChartPath.then(testnetAddonsHelmChartPath => testnetAddonsHelmChartPath.result),
        maxHistory: 5,
        waitForJobs: false,
        values: {
            imageTag: imageTag,
            genesis: {
                era: era,
                usernamePrefix: aptosNodeHelmPrefix,
                chainId: chainId,
                numValidators: numValidators,
            },
            service: {
                domain: domain,
                awsTags: awsTagsMap,
            },
            ingress: {
                acmCertificate: awsAcmCertForIngress ? awsAcmCertForIngress.arn : undefined,
                loadBalancerSourceRanges: clientSourcesIpv4,
            },
            loadTest: {
                fullnodeGroups: aptosNodeHelmValues.fullnode ? aptosNodeHelmValues.fullnode.groups : [],
                config: {
                    numFullnodeGroups: numFullnodeGroups,
                },
            },
            ...testnetAddonsHelmValues,
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                testnetAddonsHelmChartPath
            ).digest('hex') : "",
        },
    });

    const iamDocForForgeAssumeRole = aws.iam.getPolicyDocumentOutput({
        statements: [{
            actions: ["sts:AssumeRoleWithWebIdentity"],
            principals: [{
                type: "Federated",
                identifiers: [pulumi.all([currentAwsCallerIdentity, validator.openidConnectProvider]).apply(([current, oidcProvider]) => `arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`)],
            }],
            conditions: [
                {
                    test: "StringEquals",
                    variable: pulumi.interpolate`${validator.openidConnectProvider}:sub`,
                    values: ["system:serviceaccount:default:forge"],
                },
                {
                    test: "StringEquals",
                    variable: pulumi.interpolate`${validator.openidConnectProvider}:aud`,
                    values: ["sts.amazonaws.com"],
                },
            ],
        }],
    });

    const iamRoleForge = new aws.iam.Role("forge", {
        name: pulumi.interpolate`aptos-node-testnet-${workspaceName}-forge`,
        path: iamPath,
        permissionsBoundary: permissionsBoundaryPolicy,
        assumeRolePolicy: iamDocForForgeAssumeRole.apply(forgeAssumeRole => forgeAssumeRole.json),
    });



    const helmReleaseForForge = new k8s.helm.v3.Release(`forge`, {
        name: "forge",
        chart: forgeHelmChartPath.then(forgeHelmChartPath => forgeHelmChartPath.result),
        maxHistory: 2,
        waitForJobs: false,
        values: {
            forge: {
                image: {
                    tag: imageTag,
                },
            },
            serviceAccount: {
                annotations: {
                    "eks.amazonaws.com/role-arn": iamRoleForge.arn,
                },
            },
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                forgeHelmChartPath
            ).digest('hex') : "",
        },
    });

    const iamDocForForgeS3StarOnForgeBucket = aws.iam.getPolicyDocumentOutput({
        statements: [{
            sid: "AllowS3",
            actions: ["s3:*"],
            resources: [
                `arn:aws:s3:::${forgeConfigS3Bucket}*`,
                `arn:aws:s3:::${forgeConfigS3Bucket}/*`,
            ],
        }],
    });

    const iamRolePolicyForForge = new aws.iam.RolePolicy("forge", {
        name: "Helm",
        role: iamRoleForge.name,
        policy: iamDocForForgeS3StarOnForgeBucket.apply(forge => forge.json),
    });
}

if (enableNodeHealthChecker) {
    const helmReleaseForNodeHealthChecker = new k8s.helm.v3.Release(`node-health-checker`, {
        name: "node-health-checker",
        chart: nodeHealthCheckerHelmChartPath.then(nodeHealthCheckerHelmChartPath => nodeHealthCheckerHelmChartPath.result),
        maxHistory: 5,
        waitForJobs: false,
        values: {
            imageTag: imageTag,
            serviceAccount: {
                create: false,
                name: "testnet-addons",
            },
            ...nodeHealthCheckerHelmValues,
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                nodeHealthCheckerHelmChartPath
            ).digest('hex') : "",
        },
    });
}

export const oidcProvider = validator.openidConnectProvider;
export const workspace = workspaceName;

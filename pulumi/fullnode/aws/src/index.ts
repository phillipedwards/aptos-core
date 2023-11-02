import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import * as std from "@pulumi/std";
import { awsEksCluster } from "../../../components/aws_eks/src/index";
import * as crypto from "crypto";
import * as fs from "fs";
import { map } from "@pulumi/std/map";
import { computeSha1ForHelmRelease } from "../../../lib/helpers"
import { getK8sProviderFromEksCluster } from "../../../lib/awsEksKubeConfig"

function notImplemented(message: string) {
    throw new Error(message);
}

const awsConfig = new pulumi.Config("aws");
const config = new pulumi.Config();
// If specified, overrides the usage of Terraform workspace for naming purposes
const workspaceNameOverride: pulumi.Input<string> = config.get("workspaceNameOverride") || "";
// Path to use when naming IAM objects
const iamPath: pulumi.Input<string> = config.get("iamPath") || "/";
// ARN of IAM policy to set as permissions boundary on created roles
const permissionsBoundaryPolicy: pulumi.Input<string> = config.get("permissionsBoundaryPolicy") || "";
// List of CIDR subnets which can access Kubernetes API
const adminSourcesIpv4: pulumi.Input<string>[] = config.requireObject<Array<string>>("adminSourcesIpv4");
// List of CIDR subnets which can access the testnet API
const clientSourcesIpv4: pulumi.Input<string>[] = config.requireObject<Array<string>>("clientSourcesIpv4");
// List of AWS roles to configure as Kubernetes administrators
const k8sAdminRoles: pulumi.Input<string>[] = config.getObject<Array<string>>("k8sAdminRoles") || [];
// List of AWS usernames to configure as Kubernetes administrators
const k8sAdmins: pulumi.Input<string>[] = config.getObject<Array<string>>("k8sAdmins") || [];
const numFullnodes: pulumi.Input<number> = config.getNumber("numFullnodes") || 1;
// Docker image tag for aptos components. Overrides ecr_repo method.
const imageTag: pulumi.Input<string> = config.get("imageTag") || "";
// Name of an ECR repo to resolve 'stable' tag to a specific revision
const ecrRepo: pulumi.Input<string> = config.get("ecrRepo") || "";
// Chain era, used to start a clean chain
const era: pulumi.Input<number> = config.getNumber("era") || 15;
// aptos chain ID
const chainId: pulumi.Input<string> = config.get("chainId") || "DEVNET";
// Aptos chain name
const chainName: pulumi.Input<string> = config.get("chainName") || "devnet";
// Name of the fullnode node owner
const fullnodeName: pulumi.Input<string> = config.require("fullnodeName");
// Map of values to pass to pfn-addons Helm
const pfnHelmValues: pulumi.Input<object> = config.getObject("pfnHelmValues") || {};
// Map of values to pass to public fullnode Helm
const fullnodeHelmValues: pulumi.Input<object> = config.getObject("fullnodeHelmValues") || {};
// List of values to pass to public fullnode, for setting different value per node. length(fullnode_helm_values_list) must equal var.num_fullnodes
const fullnodeHelmValuesList: pulumi.Input<object>[] = config.getObject<pulumi.Input<object>[]>("fullnodeHelmValuesList") || [{}];
// Route53 Zone ID to create records in
const zoneId: pulumi.Input<string> = config.get("zoneId") || "";
// List of Subject Alternate Names to include in TLS certificate
const tlsSans: pulumi.Input<string>[] = config.getObject<Array<string>>("tlsSans") || [];
// Include Terraform workspace name in DNS records
const workspaceDns: pulumi.Input<boolean> = config.getBoolean("workspaceDns") || true;
// DNS prefix for fullnode url
const dnsPrefixName: pulumi.Input<string> = config.get("dnsPrefixName") || "fullnode";
// Enable separate public fullnode logger pod
const enablePfnLogger: pulumi.Input<boolean> = config.getBoolean("enablePfnLogger") || false;
// Map of values to pass to public fullnode logger Helm
const pfnLoggerHelmValues: pulumi.Input<object> = config.getObject("pfnLoggerHelmValues") || {};
// Instance type used for utilities
const utilityInstanceType: pulumi.Input<string> = config.get("utilityInstanceType") || "t3.medium";
// Instance type used for validator and fullnodes
const fullnodeInstanceType: pulumi.Input<string> = config.get("fullnodeInstanceType") || "c6i.8xlarge";
// Number of extra instances to add into node pool
const numExtraInstance: pulumi.Input<number> = config.getNumber("numExtraInstance") || 0;
// enable data backup from fullnode
const enableBackup: pulumi.Input<boolean> = config.getBoolean("enableBackup") || false;
// provide data backups to the public
const enablePublicBackup: pulumi.Input<boolean> = config.getBoolean("enablePublicBackup") || false;
// index of fullnode to backup data from
const backupFullnodeIndex: pulumi.Input<number> = config.getNumber("backupFullnodeIndex") || 0;
// Which storage class to use for the validator and fullnode
const fullnodeStorageClass: pulumi.Input<string> = config.get("fullnodeStorageClass") || "io1";
// Enable monitoring helm chart
const enableMonitoring: pulumi.Input<boolean> = config.getBoolean("enableMonitoring") || false;
// Map of values to pass to monitoring Helm
const monitoringHelmValues: pulumi.Input<object> = config.getObject("monitoringHelmValues") || {};
// Enable prometheus-node-exporter within monitoring helm chart
const enablePrometheusNodeExporter: pulumi.Input<boolean> = config.getBoolean("enablePrometheusNodeExporter") || false;
// Enable kube-state-metrics within monitoring helm chart
const enableKubeStateMetrics: pulumi.Input<boolean> = config.getBoolean("enableKubeStateMetrics") || false;
// Whether to manage the aptos-node k8s workload via Terraform. If set to false, the helm_release resource will still be created and updated when values change, but it may not be updated on every apply
const manageViaPulumi: pulumi.Input<boolean> = config.getBoolean("manageViaPulumi") || true;

const workspaceName = workspaceNameOverride || pulumi.getStack();

const currentAwsCallerIdentity = aws.getCallerIdentityOutput({});
const currentAwsAccountId = currentAwsCallerIdentity.accountId;

const region = awsConfig.require("region") || process.env.AWS_REGION;
const profile = awsConfig.require("profile") || process.env.AWS_REGION;
const defaultProviderConfig = new pulumi.Config("awsDefaultProvider");
const k8sDefaultProviderAlias = defaultProviderConfig.get("k8sDefaultProviderAlias");

const awsTagsMap = {
    "pulumi": "pfn",
    "pulumi/organziation": pulumi.getOrganization(),
    "pulumi/project": pulumi.getProject(),
    "pulumi/stack": pulumi.getStack(),
};

const awsProvider = new aws.Provider("aws", {
    // TODO: fix region configurability
    region: "us-west-2",
    // accessKey: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : undefined,
    // secretKey: process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : undefined,
    // profile: process.env.AWS_PROFILE ? process.env.AWS_PROFILE : undefined,
    defaultTags: {
        tags: {
            ...awsTagsMap,
            // TODO: add this tag to aws resources but fix the name
            // "kubernetes.io/cluster/aptos-default": "owned",
        }
    }
}, { aliases: k8sDefaultProviderAlias ? [k8sDefaultProviderAlias] : [] })

const helmChartPathForPfnAddons = std.abspath({ input: "../../helm/pfn-addons" });
const helmChartPathForPfnLogger = std.abspath({ input: "../../helm/logger" });
const helmChartPathForFullnode = std.abspath({ input: "../../helm/fullnode" });
const helmChartPathForMonitoring = std.abspath({ input: "../../helm/monitoring" });

let finalImageTag: pulumi.Output<string>;

if (imageTag !== "") {
    finalImageTag = pulumi.output(imageTag);
} else if (ecrRepo !== "") {
    const stableImage = aws.ecr.getImageOutput({
        repositoryName: ecrRepo,
        imageTag: "stable",
    });
    finalImageTag = stableImage.imageTags.apply(tags => tags.find(tag => tag.startsWith("main_")) || "latest");
} else {
    finalImageTag = pulumi.output("latest");
}

const eksCluster = new awsEksCluster("eks", {
    region: "us-west-2",
    workspaceNameOverride: `pfn-${workspaceName}`,
    eksClusterName: `aptos-pfn-${workspaceName}`,
    iamPath: iamPath,
    k8sAdmins: k8sAdmins,
    k8sAdminRoles: k8sAdminRoles,
    permissionsBoundaryPolicy: permissionsBoundaryPolicy,
    utilityInstanceType: utilityInstanceType,
    fullnodeInstanceType: fullnodeInstanceType,
    numFullnodes: numFullnodes,
    numExtraInstance: numExtraInstance,
});
// const aptos = aws.eks.getClusterOutput({
//     name: `aptos-pfn-${workspaceName}`,
// });
// const aptosData = aws.eks.getClusterAuthOutput({
//     name: aptos.apply(aptos => eksCluster.eksCluster.name),
// });

const k8sProvider = getK8sProviderFromEksCluster({
    eksCluster: eksCluster.eksCluster,
    region: "us-west-2",
    accountId: currentAwsAccountId,
});

const iamDocForExternalDns = aws.iam.getPolicyDocumentOutput({
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
const iamDocForAlbIngress = aws.iam.getPolicyDocumentOutput({
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
const oidcProviderForEksCluster = new aws.iam.OpenIdConnectProvider("cluster", {
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
    url: eksCluster.eksCluster.identities?.[0]?.oidcs?.[0]?.issuer,
});

const oidcProvider = oidcProviderForEksCluster.url.apply(url => url.replace("https://", ""));

const iamDocForK8sIntegrationsTrust = aws.iam.getPolicyDocumentOutput({
    statements: [{
        actions: ["sts:AssumeRoleWithWebIdentity"],
        principals: [{
            type: "Federated",
            identifiers: [currentAwsAccountId.apply(current => `arn:aws:iam::${current}:oidc-provider/${oidcProvider}`)],
        }],
        conditions: [
            {
                test: "StringEquals",
                variable: `${oidcProvider}:sub`,
                values: ["system:serviceaccount:kube-system:k8s-aws-integrations"],
            },
            {
                test: "StringEquals",
                variable: `${oidcProvider}:aud`,
                values: ["sts.amazonaws.com"],
            },
        ],
    }],
});
const iamRoleForK8sIntegrations = new aws.iam.Role("k8s-aws-integrations", {
    name: `${workspaceName}-pfn-k8s-aws-integrations`,
    path: iamPath,
    assumeRolePolicy: iamDocForK8sIntegrationsTrust.apply(k8s_aws_integrations_assume_role => k8s_aws_integrations_assume_role.json),
    permissionsBoundary: permissionsBoundaryPolicy,
    tags: {
        pulumi: "pfn",
        workspace: workspaceName,
    },
});

const iamRolePolicyForAlbIngress = new aws.iam.RolePolicy("alb-ingress", {
    name: "EKS-Ingress",
    role: iamRoleForK8sIntegrations.name,
    policy: iamDocForAlbIngress.apply(doc => doc.json),
});
const randomIdForBackupBucket = new random.RandomId("backup-bucket", { byteLength: 4 });
const awsS3BucketForBackup = new aws.s3.BucketV2("backup", { bucket: pulumi.interpolate`aptos-${workspaceName}-backup-${randomIdForBackupBucket.hex}` });
const awsS3BucketPolicyAccessBlockForBackup = new aws.s3.BucketPublicAccessBlock("backup", {
    bucket: awsS3BucketForBackup.id,
    blockPublicAcls: !enablePublicBackup,
    blockPublicPolicy: !enablePublicBackup,
    ignorePublicAcls: !enablePublicBackup,
    restrictPublicBuckets: !enablePublicBackup,
});
const awsS3BucketAclForBackup: aws.s3.BucketAclV2[] = [];
if (enablePublicBackup) {
    awsS3BucketAclForBackup.push(new aws.s3.BucketAclV2(`public-backup`, {
        bucket: awsS3BucketForBackup.id,
        acl: "public-read",
    }));
}

const iamDocForBackupRoleTrust = pulumi.all([currentAwsAccountId, oidcProvider]).apply(
    ([accountId, oidc]) => {
        return aws.iam.getPolicyDocument({
            statements: [{
                actions: ["sts:AssumeRoleWithWebIdentity"],
                principals: [{
                    type: "Federated",
                    identifiers: [`arn:aws:iam::${accountId}:oidc-provider/${oidc}`],
                }],
                conditions: [
                    {
                        test: "StringEquals",
                        variable: `${oidcProvider}:sub`,
                        values: Array.from({ length: numFullnodes }, (_, i) =>
                            `system:serviceaccount:default:pfn${i}-aptos-fullnode`),
                    },
                    {
                        test: "StringEquals",
                        variable: `${oidcProvider}:aud`,
                        values: ["sts.amazonaws.com"],
                    },
                ],
            }],
        });
    });

const iamDocForReadWriteListOnBackupBucket = aws.iam.getPolicyDocumentOutput({
    statements: [{
        actions: [
            "s3:GetObject",
            "s3:ListBucket",
            "s3:PutObject",
        ],
        resources: [
            pulumi.interpolate`arn:aws:s3:::${awsS3BucketForBackup.id}`,
            pulumi.interpolate`arn:aws:s3:::${awsS3BucketForBackup.id}/*`,
        ],
    }],
});
const iamRoleForBackup = new aws.iam.Role("backup", {
    name: `aptos-${workspaceName}-backup`,
    path: iamPath,
    permissionsBoundary: permissionsBoundaryPolicy,
    assumeRolePolicy: iamDocForBackupRoleTrust.json,
});
const iamRolePolicyForBackup = new aws.iam.RolePolicy("backup", {
    name: "Backup",
    role: iamRoleForBackup.name,
    policy: iamDocForReadWriteListOnBackupBucket.json,
});

const k8sServiceAccForAwsIntegrations = new k8s.core.v1.ServiceAccount("k8s-aws-integrations", {
    metadata: {
        name: "k8s-aws-integrations",
        namespace: "kube-system",
        annotations: {
            "eks.amazonaws.com/role-arn": iamRoleForK8sIntegrations.arn,
        },
    }
});

let iamRolePolicyForK8sIntegrations = undefined
let rt53ZoneOutputForPfn = undefined
let dnsPrefix = undefined
let domain = undefined
let acmCertForIngress = undefined
let rt53RecordForCertValidationForIngress = undefined
let acmCertValidationForIngress = undefined
let helmReleaseForExternalDns = undefined

if (zoneId) {
    iamRolePolicyForK8sIntegrations = new aws.iam.RolePolicy(`k8s-aws-integrations`, {
        name: "External-DNS",
        role: iamRoleForK8sIntegrations.name,
        policy: iamDocForExternalDns.apply(external_dns => external_dns.json),
    });

    rt53ZoneOutputForPfn = aws.route53.getZoneOutput({
        zoneId: zoneId,
    });

    dnsPrefix = workspaceDns ? `${workspaceName}.${dnsPrefixName}.` : `${dnsPrefixName}.`;
    domain = pulumi.interpolate`${dnsPrefix}${rt53ZoneOutputForPfn.name}`;

    acmCertForIngress = new aws.acm.Certificate(`ingress`, {
        domainName: domain,
        subjectAlternativeNames: std.concatOutput({
            input: [
                [domain.apply(domain => `*.${domain}`)],
                tlsSans,
            ],
        }).apply(invoke => invoke.result),
        validationMethod: "DNS",
        tags: {
            pulumi: "pfn",
            workspace: workspaceName,
        },
    });

    rt53RecordForCertValidationForIngress = new aws.route53.Record(`ingress-acm-validation`, {
        name: acmCertForIngress.domainValidationOptions[0].resourceRecordName,
        records: [acmCertForIngress.domainValidationOptions[0].resourceRecordValue],
        ttl: 60,
        type: acmCertForIngress.domainValidationOptions[0].resourceRecordType,
        zoneId: zoneId,
    });

    acmCertValidationForIngress = new aws.acm.CertificateValidation(`ingress`, {
        certificateArn: acmCertForIngress.arn,
        validationRecordFqdns: [rt53RecordForCertValidationForIngress.fqdn],
    });

    helmReleaseForExternalDns = new k8s.helm.v3.Release(`external-dns`, {
        name: "external-dns",
        repositoryOpts: {
            repo: "https://kubernetes-sigs.github.io/external-dns",
        },
        chart: "external-dns",
        version: "1.11.0",
        namespace: "kube-system",
        maxHistory: 5,
        waitForJobs: false,
        values: [JSON.stringify({
            serviceAccount: {
                create: false,
                name: k8sServiceAccForAwsIntegrations.metadata.name,
            },
            domainFilters: rt53ZoneOutputForPfn ? [rt53ZoneOutputForPfn.name] : [],
            txtOwnerId: zoneId,
        })],
    });
}

// when upgrading the AWS ALB ingress controller, update the CRDs as well using:
// kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller/crds?ref=master"
const helmReleaseForAwsLbController = new k8s.helm.v3.Release("aws-load-balancer-controller", {
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
            name: k8sServiceAccForAwsIntegrations.metadata.name,
        },
        clusterName: eksCluster.eksCluster.name,
        region: region,
        vpcId: eksCluster.vpc.id,
    })],
});

const helmReleaseForPfnAddons = new k8s.helm.v3.Release("pfn-addons", {
    name: "pfn-addons",
    chart: helmChartPathForPfnAddons.then(path => path.result),
    maxHistory: 10,
    waitForJobs: false,
    values: {
        service: {
            domain: domain,
            awsTags: awsTagsMap,
            fullnode: {
                numFullnodes: numFullnodes,
                loadBalancerSourceRanges: clientSourcesIpv4,
            },
        },
        ingress: {
            "class": "alb",
            acmCertificate: acmCertForIngress ? acmCertForIngress.arn : undefined,
            loadBalancerSourceRanges: clientSourcesIpv4,
        },
        ...pfnHelmValues,
        chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
            helmChartPathForPfnAddons
        ).digest('hex') : "",
    },
});
const helmReleaseForFullnode: k8s.helm.v3.Release[] = [];
for (const range = { value: 0 }; range.value < numFullnodes; range.value++) {
    helmReleaseForFullnode.push(new k8s.helm.v3.Release(`fullnode-${range.value}`, {
        name: `pfn${range.value}`,
        chart: helmChartPathForFullnode.then(path => path.result),
        maxHistory: 10,
        waitForJobs: false,
        values: {
            imageTag: finalImageTag,
            manageImages: manageViaPulumi,
            chain: {
                era: era,
                name: chainName,
            },
            image: {
                tag: finalImageTag,
            },
            logging: {
                address: enablePfnLogger ? "fullnode-pfn-aptos-logger:5044" : "",
            },
            nodeSelector: {
                "eks.amazonaws.com/nodegroup": "fullnode",
            },
            storage: {
                "class": fullnodeStorageClass,
            },
            service: {
                type: "LoadBalancer",
                annotations: {
                    "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                    "external-dns.alpha.kubernetes.io/hostname": `pfn${range.value}.${domain}`,
                    "alb.ingress.kubernetes.io/healthcheck-path": "/v1/-/healthy",
                },
            },
            backup: {
                enable: range.value == backupFullnodeIndex ? enableBackup : false,
                config: {
                    location: "s3",
                    s3: {
                        bucket: awsS3BucketForBackup.bucket,
                    },
                },
            },
            restore: {
                config: {
                    location: "s3",
                    s3: {
                        bucket: awsS3BucketForBackup.bucket,
                    },
                },
            },
            serviceAccount: {
                annotations: {
                    "eks.amazonaws.com/role-arn": iamRoleForBackup.arn,
                },
            },
            ...fullnodeHelmValues,
            ...fullnodeHelmValuesList.length === 0 ? {} : fullnodeHelmValuesList[range.value],
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                helmChartPathForFullnode
            ).digest('hex') : "",
        },
    }));
}

if (enablePfnLogger) {
    const helmReleaseForPfnLogger = new k8s.helm.v3.Release(`pfn-logger`, {
        name: "pfn-logger",
        chart: helmChartPathForPfnLogger.then(path => path.result),
        maxHistory: 10,
        waitForJobs: false,
        values: {
            logger: {
                name: "pfn",
            },
            chain: {
                name: `aptos-${workspaceName}`,
            },
            ...pfnLoggerHelmValues,
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                helmChartPathForPfnLogger
            ).digest('hex') : "",
        },
    });
}

if (enableMonitoring) {
    const helmReleaseForMonitoring = new k8s.helm.v3.Release(`monitoring`, {
        name: "aptos-monitoring",
        chart: helmChartPathForMonitoring.then(path => path.result),
        maxHistory: 5,
        waitForJobs: false,
        values: {
            chain: {
                name: chainName,
            },
            fullnode: {
                name: fullnodeName,
            },
            service: {
                domain: domain,
            },
            "kube-state-metrics": {
                enabled: enableKubeStateMetrics,
            },
            "prometheus-node-exporter": {
                enabled: enablePrometheusNodeExporter,
            },
            monitoring: {
                prometheus: {
                    storage: {
                        "class": "gp3",
                    },
                },
            },
            ...monitoringHelmValues,
            chart_sha1: manageViaPulumi ? computeSha1ForHelmRelease(
                helmChartPathForMonitoring
            ).digest('hex') : "",
        },
    });
}

const kubernetesMasterVersion = std.substrOutput({
    input: eksCluster.eksCluster.version,
    length: 0,
    offset: 4,
}).apply(invoke => invoke.result);

let allNamespaces = new Map<string, k8s.core.v1.Namespace>();

allNamespaces.forEach((namespace) => {
    new k8s.rbac.v1.RoleBinding(`disable-psp-${namespace.metadata.name}`, {
        metadata: {
            name: "privileged-psp",
            namespace: namespace.metadata.name,
        },
        roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: "eks:podsecuritypolicy:privileged",
        },
        subjects: [{
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Group",
            name: `system:serviceaccounts:${namespace.metadata.name}`,
        }],
    });
});


const baselinePssLabels = {
    "pod-security.kubernetes.io/audit": "baseline",
    "pod-security.kubernetes.io/warn": "baseline",
    "pod-security.kubernetes.io/enforce": "privileged",
};
//   subject {
//     api_group = "rbac.authorization.k8s.io"
//     kind      = "Group"
//     name      = "system:serviceaccounts:${each.value}"
//   }
// }

const pssDefault = new k8s.core.v1.Namespace("pss-default", {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
        name: "default",
        labels: baselinePssLabels
    }
});

import * as pulumi from "@pulumi/pulumi";
import * as _null from "@pulumi/null";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";
import * as helm from "@pulumi/helm";
import * as kubernetes from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import * as std from "@pulumi/std";
import * as time from "@pulumi/time";

function notImplemented(message: string) {
    throw new Error(message);
}

export = async () => {
    const config = new pulumi.Config();
    // AWS region
    const region = config.require("region");
    // Number of availability zones
    const numAzs = config.getNumber("numAzs") || 3;
    // Version of Kubernetes to use for EKS cluster
    const kubernetesVersion = config.get("kubernetesVersion") || "1.24";
    // List of CIDR subnets which can access the Kubernetes API endpoint
    const k8sApiSources = config.getObject("k8sApiSources") || ["0.0.0.0/0"];
    // The number of validator nodes to create
    const numValidators = config.getNumber("numValidators") || 1;
    // The number of fullnode groups to create
    const numFullnodeGroups = config.getNumber("numFullnodeGroups") || 1;
    // Chain era, used to start a clean chain
    const era = config.getNumber("era") || 1;
    // Aptos chain ID
    const chainId = config.get("chainId") || "TESTING";
    // Aptos chain name
    const chainName = config.get("chainName") || "testnet";
    // Name of the validator node owner
    const validatorName = config.require("validatorName");
    // Docker image tag for Aptos node
    const imageTag = config.get("imageTag") || "devnet";
    // Zone ID of Route 53 domain to create records in
    const zoneId = config.get("zoneId") || "";
    // Include Terraform workspace name in DNS records
    const workspaceDns = config.getBoolean("workspaceDns") || true;
    // DNS record name to use (<workspace> is replaced with the TF workspace name)
    const recordName = config.get("recordName") || "<workspace>.aptos";
    // Creates DNS records in var.zone_id that point to k8s service, as opposed to using external-dns or other means
    const createRecords = config.getBoolean("createRecords") || true;
    // Path to aptos-validator Helm chart file
    const helmChart = config.get("helmChart") || "";
    // Map of values to pass to Helm
    const helmValues = config.getObject("helmValues") || {};
    // Path to file containing values for Helm chart
    const helmValuesFile = config.get("helmValuesFile") || "";
    // List of AWS usernames to configure as Kubernetes administrators
    const k8sAdmins = config.getObject<Array<string>>("k8sAdmins") || [];
    // List of AWS roles to configure as Kubernetes administrators
    const k8sAdminRoles = config.getObject<Array<string>>("k8sAdminRoles") || [];
    // List of AWS usernames to configure as Kubernetes viewers
    const k8sViewers = config.getObject<Array<string>>("k8sViewers") || [];
    // List of AWS roles to configure as Kubernetes viewers
    const k8sViewerRoles = config.getObject<Array<string>>("k8sViewerRoles") || [];
    // List of AWS usernames to configure as Kubernetes debuggers
    const k8sDebuggers = config.getObject<Array<string>>("k8sDebuggers") || [];
    // List of AWS roles to configure as Kubernetes debuggers
    const k8sDebuggerRoles = config.getObject<Array<string>>("k8sDebuggerRoles") || [];
    // Path to use when naming IAM objects
    const iamPath = config.get("iamPath") || "/";
    // ARN of IAM policy to set as permissions boundary on created roles
    const permissionsBoundaryPolicy = config.get("permissionsBoundaryPolicy") || "";
    // VPC CIDR Block
    const vpcCidrBlock = config.get("vpcCidrBlock") || "192.168.0.0/16";
    // Whether to maximize the capacity of the cluster by allocating more IPs to the first AZ
    const maximizeSingleAzCapacity = config.getBoolean("maximizeSingleAzCapacity") || false;
    // Enable deployment of the validator Helm chart
    const helmEnableValidator = config.getBoolean("helmEnableValidator") || true;
    // Instance type used for utilities
    const utilityInstanceType = config.get("utilityInstanceType") || "t3.2xlarge";
    // Number of instances for utilities
    const utilityInstanceNum = config.getNumber("utilityInstanceNum") || 1;
    // Minimum number of instances for utilities
    const utilityInstanceMinNum = config.getNumber("utilityInstanceMinNum") || 1;
    // Maximum number of instances for utilities. If left 0, defaults to 2 * var.utility_instance_num
    const utilityInstanceMaxNum = config.getNumber("utilityInstanceMaxNum") || 0;
    // Whether to taint the instances in the utility nodegroup
    const utilityInstanceEnableTaint = config.getBoolean("utilityInstanceEnableTaint") || false;
    // Instance type used for validator and fullnodes
    const validatorInstanceType = config.get("validatorInstanceType") || "c6i.8xlarge";
    // Number of instances used for validator and fullnodes
    const validatorInstanceNum = config.getNumber("validatorInstanceNum") || 2;
    // Minimum number of instances for validators
    const validatorInstanceMinNum = config.getNumber("validatorInstanceMinNum") || 1;
    // Maximum number of instances for utilities. If left 0, defaults to 2 * var.validator_instance_num
    const validatorInstanceMaxNum = config.getNumber("validatorInstanceMaxNum") || 0;
    // Whether to taint instances in the validator nodegroup
    const validatorInstanceEnableTaint = config.getBoolean("validatorInstanceEnableTaint") || false;
    // If specified, overrides the usage of Terraform workspace for naming purposes
    const workspaceNameOverride = config.get("workspaceNameOverride") || "";
    // Enable Calico networking for NetworkPolicy
    const enableCalico = config.getBoolean("enableCalico") || true;
    // Enable logger helm chart
    const enableLogger = config.getBoolean("enableLogger") || false;
    // Map of values to pass to logger Helm
    const loggerHelmValues = config.getObject("loggerHelmValues") || {};
    // Enable monitoring helm chart
    const enableMonitoring = config.getBoolean("enableMonitoring") || false;
    // Map of values to pass to monitoring Helm
    const monitoringHelmValues = config.getObject("monitoringHelmValues") || {};
    // Enable prometheus-node-exporter within monitoring helm chart
    const enablePrometheusNodeExporter = config.getBoolean("enablePrometheusNodeExporter") || false;
    // Enable kube-state-metrics within monitoring helm chart
    const enableKubeStateMetrics = config.getBoolean("enableKubeStateMetrics") || false;
    // If set, overrides the name of the aptos-node helm chart
    const helmReleaseNameOverride = config.get("helmReleaseNameOverride") || "";
    // Which storage class to use for the validator and fullnode
    const validatorStorageClass = config.get("validatorStorageClass") || "io1";
    // Which storage class to use for the validator and fullnode
    const fullnodeStorageClass = config.get("fullnodeStorageClass") || "io1";
    // Whether to manage the aptos-node k8s workload via Terraform. If set to false, the helm_release resource will still be created and updated when values change, but it may not be updated on every apply
    const manageViaTf = config.getBoolean("manageViaTf") || true;
    const available = aws.getAvailabilityZonesOutput({
        state: "available",
    });
    const awsAvailabilityZones = notImplemented("slice(sort(data.aws_availability_zones.available.names),0,min(3,length(data.aws_availability_zones.available.names)))");
    const workspaceName = workspaceNameOverride == "" ? notImplemented("terraform.workspace") : workspaceNameOverride;
    const defaultTags = {
        terraform: "validator",
        workspace: workspaceName,
    };
    const current = await aws.getCallerIdentity({});
    const eks-assume-role = aws.iam.getPolicyDocumentOutput({
        statements: [{
            actions: ["sts:AssumeRole"],
            principals: [{
                type: "Service",
                identifiers: ["eks.amazonaws.com"],
            }],
        }],
    });
    const cluster = new aws.iam.Role("cluster", {
        name: `aptos-${workspaceName}-cluster`,
        path: iamPath,
        assumeRolePolicy: eks_assume_role.apply(eks_assume_role => eks_assume_role.json),
        permissionsBoundary: permissionsBoundaryPolicy,
        tags: defaultTags,
    });
    const cluster_cluster = new aws.iam.RolePolicyAttachment("cluster-cluster", {
        policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
        role: cluster.name,
    });
    const cluster_service = new aws.iam.RolePolicyAttachment("cluster-service", {
        policyArn: "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
        role: cluster.name,
    });
    const ec2-assume-role = aws.iam.getPolicyDocumentOutput({
        statements: [{
            actions: ["sts:AssumeRole"],
            principals: [{
                type: "Service",
                identifiers: ["ec2.amazonaws.com"],
            }],
        }],
    });
    const nodes = new aws.iam.Role("nodes", {
        name: `aptos-${workspaceName}-nodes`,
        path: iamPath,
        assumeRolePolicy: ec2_assume_role.apply(ec2_assume_role => ec2_assume_role.json),
        permissionsBoundary: permissionsBoundaryPolicy,
        tags: defaultTags,
    });
    const nodesResource = new aws.iam.InstanceProfile("nodes", {
        name: `aptos-${workspaceName}-nodes`,
        role: nodes.name,
        path: iamPath,
    });
    const nodes_node = new aws.iam.RolePolicyAttachment("nodes-node", {
        policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
        role: nodes.name,
    });
    const nodes_cni = new aws.iam.RolePolicyAttachment("nodes-cni", {
        policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
        role: nodes.name,
    });
    const nodes_ecr = new aws.iam.RolePolicyAttachment("nodes-ecr", {
        policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
        role: nodes.name,
    });
    const lbCreation = new time.index.Sleep("lb_creation", {createDuration: "2m"});
    const validator_dns = new random.RandomString("validator-dns", {
        upper: false,
        special: false,
        length: 16,
    });
    const aptosData = (new Array(zoneId != "" ? 1 : 0)).map((_, i) => i).map(__index => (aws.route53.getZoneOutput({
        zoneId: zoneId,
    })));
    const dnsPrefix = workspaceDns ? `${workspaceName}.` : "";
    const myrecordName = notImplemented("replace(var.record_name,\"<workspace>\",local.workspace_name)");
    const domain = zoneId != "" ? aptosData[0].apply(aptosDatum => `${dnsPrefix}${aptosDatum.name}`) : undefined;
    const validator-lb = (new Array(zoneId == "" || !createRecords ? 0 : 1)).map((_, i) => i).map(__index => (kubernetes.index.service({
        metadata: [{
            name: `${workspaceName}-aptos-node-0-validator-lb`,
        }],
    })));
    const fullnode-lb = (new Array(zoneId == "" || !createRecords ? 0 : 1)).map((_, i) => i).map(__index => (kubernetes.index.service({
        metadata: [{
            name: `${workspaceName}-aptos-node-0-fullnode-lb`,
        }],
    })));
    const validator: aws.route53.Record[] = [];
    for (const range = {value: 0}; range.value < (zoneId == "" || !createRecords ? 0 : 1); range.value++) {
        validator.push(new aws.route53.Record(`validator-${range.value}`, {
            zoneId: zoneId,
            name: pulumi.interpolate`${validator_dns.result}.${myrecordName}`,
            type: "CNAME",
            ttl: 3600,
            records: [validator_lb[0].status[0].loadBalancer[0].ingress[0].hostname],
        }));
    }
    const fullnode: aws.route53.Record[] = [];
    for (const range = {value: 0}; range.value < (zoneId == "" || !createRecords ? 0 : 1); range.value++) {
        fullnode.push(new aws.route53.Record(`fullnode-${range.value}`, {
            zoneId: zoneId,
            name: myrecordName,
            type: "CNAME",
            ttl: 3600,
            records: [fullnode_lb[0].status[0].loadBalancer[0].ingress[0].hostname],
        }));
    }
    const mynumAzs = awsAvailabilityZones.length;
    const numOtherSubnets = mynumAzs * 2 - 1;
    const maxSubnetCidrRanges = notImplemented("cidrsubnets(var.vpc_cidr_block,1,[forxinrange(local.num_other_subnets):1+ceil(pow(local.num_other_subnets,0.5))]...)");
    const maxPrivateSubnetCidrRanges = notImplemented("slice(local.max_subnet_cidr_ranges,0,local.num_azs)");
    const maxPublicSubnetCidrRanges = notImplemented("slice(local.max_subnet_cidr_ranges,local.num_azs,local.num_azs*2)");
    const vpc = new aws.ec2.Vpc("vpc", {
        cidrBlock: vpcCidrBlock,
        enableDnsHostnames: true,
        tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}"
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="shared"
})`),
    });
    const defaultPublicSubnetCidrRanges = pulumi.all([std.rangeOutput({
        limit: mynumAzs,
    }), std.cidrsubnetOutput({
        input: std.cidrsubnetOutput({
            input: vpc.cidrBlock,
            newbits: 1,
            netnum: 0,
        }).apply(invoke => invoke.result),
        newbits: 2,
        netnum: x,
    })]).apply(([invoke, invoke1]) => .map(x => (invoke1.result)));
    const defaultPrivateSubnetCidrRanges = pulumi.all([std.rangeOutput({
        limit: mynumAzs,
    }), std.cidrsubnetOutput({
        input: std.cidrsubnetOutput({
            input: vpc.cidrBlock,
            newbits: 1,
            netnum: 1,
        }).apply(invoke => invoke.result),
        newbits: 2,
        netnum: x,
    })]).apply(([invoke, invoke1]) => .map(x => (invoke1.result)));
    const publicSubnetCidrRanges = maximizeSingleAzCapacity ? maxPublicSubnetCidrRanges : defaultPublicSubnetCidrRanges;
    const privateSubnetCidrRanges = maximizeSingleAzCapacity ? maxPrivateSubnetCidrRanges : defaultPrivateSubnetCidrRanges;
    const _public: aws.ec2.Subnet[] = [];
    for (const range = {value: 0}; range.value < mynumAzs; range.value++) {
        _public.push(new aws.ec2.Subnet(`public-${range.value}`, {
            vpcId: vpc.id,
            cidrBlock: publicSubnetCidrRanges[range.value],
            availabilityZone: awsAvailabilityZones[range.value],
            mapPublicIpOnLaunch: true,
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/public-\${local.aws_availability_zones[count.index]}"
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="shared"
"kubernetes.io/role/elb"="1"
})`),
        }));
    }
    const publicResource = new aws.ec2.InternetGateway("public", {
        vpcId: vpc.id,
        tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}"
})`),
    });
    const publicResource2 = new aws.ec2.RouteTable("public", {
        vpcId: vpc.id,
        routes: [{
            cidrBlock: "0.0.0.0/0",
            gatewayId: publicResource.id,
        }],
        tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/public"
})`),
    });
    const publicResource3: aws.ec2.RouteTableAssociation[] = [];
    for (const range = {value: 0}; range.value < mynumAzs; range.value++) {
        publicResource3.push(new aws.ec2.RouteTableAssociation(`public-${range.value}`, {
            subnetId: notImplemented("element(aws_subnet.public.*.id,count.index)"),
            routeTableId: publicResource2.id,
        }));
    }
    const _private: aws.ec2.Subnet[] = [];
    for (const range = {value: 0}; range.value < mynumAzs; range.value++) {
        _private.push(new aws.ec2.Subnet(`private-${range.value}`, {
            vpcId: vpc.id,
            cidrBlock: privateSubnetCidrRanges[range.value],
            availabilityZone: awsAvailabilityZones[range.value],
            tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/private-\${local.aws_availability_zones[count.index]}"
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="shared"
"kubernetes.io/role/internal-elb"="1"
})`),
        }));
    }
    const nat = new aws.ec2.Eip("nat", {
        vpc: true,
        tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}-nat"
})`),
    });
    const privateResource = new aws.ec2.NatGateway("private", {
        allocationId: nat.id,
        subnetId: _public[0].id,
        tags: defaultTags,
    });
    const privateResource2 = new aws.ec2.RouteTable("private", {
        vpcId: vpc.id,
        routes: [{
            cidrBlock: "0.0.0.0/0",
            natGatewayId: privateResource.id,
        }],
        tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/private"
})`),
    });
    const privateResource3: aws.ec2.RouteTableAssociation[] = [];
    for (const range = {value: 0}; range.value < mynumAzs; range.value++) {
        privateResource3.push(new aws.ec2.RouteTableAssociation(`private-${range.value}`, {
            subnetId: notImplemented("element(aws_subnet.private.*.id,count.index)"),
            routeTableId: privateResource2.id,
        }));
    }
    const clusterResource2 = new aws.ec2.SecurityGroup("cluster", {
        name: `aptos-${workspaceName}/cluster`,
        description: "k8s masters",
        vpcId: vpc.id,
        tags: notImplemented(`merge(local.default_tags,{
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="owned"
})`),
    });
    const nodesResource4 = new aws.ec2.SecurityGroup("nodes", {
        name: `aptos-${workspaceName}/nodes`,
        description: "k8s nodes",
        vpcId: vpc.id,
        tags: notImplemented(`merge(local.default_tags,{
"kubernetes.io/cluster/aptos-\${local.workspace_name}"="owned"
})`),
    });
    const cluster_api = new aws.ec2.SecurityGroupRule("cluster-api", {
        securityGroupId: clusterResource2.id,
        type: "ingress",
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        sourceSecurityGroupId: nodesResource4.id,
        description: "Allow API traffic from k8s nodes",
    });
    const cluster_kubelet = new aws.ec2.SecurityGroupRule("cluster-kubelet", {
        securityGroupId: clusterResource2.id,
        type: "egress",
        protocol: "tcp",
        fromPort: 10250,
        toPort: 10250,
        sourceSecurityGroupId: nodesResource4.id,
        description: "Allow kubelet traffic to k8s nodes",
    });
    const nodes_tcp = new aws.ec2.SecurityGroupRule("nodes-tcp", {
        securityGroupId: nodesResource4.id,
        type: "ingress",
        protocol: "tcp",
        fromPort: 1025,
        toPort: 65535,
        sourceSecurityGroupId: nodesResource4.id,
        description: "Allow TCP traffic between k8s nodes",
    });
    const nodes_udp = new aws.ec2.SecurityGroupRule("nodes-udp", {
        securityGroupId: nodesResource4.id,
        type: "ingress",
        protocol: "udp",
        fromPort: 1025,
        toPort: 65535,
        sourceSecurityGroupId: nodesResource4.id,
        description: "Allow UDP traffic between k8s nodes",
    });
    const nodes_icmp = new aws.ec2.SecurityGroupRule("nodes-icmp", {
        securityGroupId: nodesResource4.id,
        type: "ingress",
        protocol: "icmp",
        fromPort: -1,
        toPort: -1,
        sourceSecurityGroupId: nodesResource4.id,
        description: "Allow ICMP traffic between k8s nodes",
    });
    const nodes_dns = new aws.ec2.SecurityGroupRule("nodes-dns", {
        securityGroupId: nodesResource4.id,
        type: "ingress",
        protocol: "udp",
        fromPort: 53,
        toPort: 53,
        sourceSecurityGroupId: nodesResource4.id,
        description: "Allow DNS traffic between k8s nodes",
    });
    const nodes_kubelet = new aws.ec2.SecurityGroupRule("nodes-kubelet", {
        securityGroupId: nodesResource4.id,
        type: "ingress",
        protocol: "tcp",
        fromPort: 10250,
        toPort: 10250,
        sourceSecurityGroupId: clusterResource2.id,
        description: "Allow kubelet traffic from k8s masters",
    });
    const nodes_egress = new aws.ec2.SecurityGroupRule("nodes-egress", {
        securityGroupId: nodesResource4.id,
        type: "egress",
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outgoing traffic",
    });
    const eks = new aws.cloudwatch.LogGroup("eks", {
        name: `/aws/eks/aptos-${workspaceName}/cluster`,
        retentionInDays: 7,
        tags: defaultTags,
    });
    const aptosResource = new aws.eks.Cluster("aptos", {
        name: `aptos-${workspaceName}`,
        roleArn: cluster.arn,
        version: kubernetesVersion,
        enabledClusterLogTypes: [
            "api",
            "audit",
            "authenticator",
            "controllerManager",
            "scheduler",
        ],
        tags: defaultTags,
        vpcConfig: {
            subnetIds: std.concatOutput({
                input: [
                    _public.map(__item => __item.id),
                    _private.map(__item => __item.id),
                ],
            }).apply(invoke => invoke.result),
            publicAccessCidrs: k8sApiSources,
            endpointPrivateAccess: true,
            securityGroupIds: [clusterResource2.id],
        },
    });
    const aptos = aws.eks.getClusterAuthOutput({
        name: aptosResource.name,
    });
    const pools = {
        utilities: {
            instanceType: utilityInstanceType,
            minSize: utilityInstanceMinNum,
            desiredSize: utilityInstanceNum,
            maxSize: utilityInstanceMaxNum > 0 ? utilityInstanceMaxNum : 2 * utilityInstanceNum,
            taint: utilityInstanceEnableTaint,
        },
        validators: {
            instanceType: validatorInstanceType,
            minSize: validatorInstanceMinNum,
            desiredSize: validatorInstanceNum,
            maxSize: validatorInstanceMaxNum > 0 ? validatorInstanceMaxNum : 2 * validatorInstanceNum,
            taint: validatorInstanceEnableTaint,
        },
    };
    const nodesResource2: aws.ec2.LaunchTemplate[] = [];
    for (const range of Object.entries(pools).map(([k, v]) => ({key: k, value: v}))) {
        nodesResource2.push(new aws.ec2.LaunchTemplate(`nodes-${range.key}`, {
            name: `aptos-${workspaceName}/${range.key}`,
            instanceType: range.value.instanceType,
            blockDeviceMappings: [{
                deviceName: "/dev/xvda",
                ebs: {
                    deleteOnTermination: "true",
                    volumeSize: 100,
                    volumeType: "gp3",
                },
            }],
            tagSpecifications: [{
                resourceType: "instance",
                tags: notImplemented(`merge(local.default_tags,{
Name="aptos-\${local.workspace_name}/\${each.key}",
})`),
            }],
        }));
    }
    const nodesResource3: aws.eks.NodeGroup[] = [];
    for (const range of Object.entries(pools).map(([k, v]) => ({key: k, value: v}))) {
        nodesResource3.push(new aws.eks.NodeGroup(`nodes-${range.key}`, {
            taints: (range.value.taint ? [pools[range.key]] : []).map((v, k) => ({key: k, value: v})).map(entry => ({
                key: "aptos.org/nodepool",
                value: range.key,
                effect: "NO_EXECUTE",
            })),
            clusterName: aptosResource.name,
            nodeGroupName: range.key,
            version: aptosResource.version,
            nodeRoleArn: nodes.arn,
            subnetIds: [_private[0].id],
            tags: defaultTags,
            launchTemplate: {
                id: nodesResource2[range.key].id,
                version: nodesResource2[range.key].latestVersion,
            },
            scalingConfig: {
                desiredSize: range.value.desiredSize,
                minSize: range.value.minSize,
                maxSize: range.value.maxSize,
            },
            updateConfig: {
                maxUnavailablePercentage: 50,
            },
        }));
    }
    const clusterResource = new aws.iam.OpenIdConnectProvider("cluster", {
        clientIdLists: ["sts.amazonaws.com"],
        thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
        url: aptosResource.identities.apply(identities => identities[0].oidcs?.[0]?.issuer),
    });
    const oidcProvider = notImplemented("replace(aws_iam_openid_connect_provider.cluster.url,\"https://\",\"\")");
    const aws-ebs-csi-driver-trust-policy = aws.iam.getPolicyDocumentOutput({
        statements: [{
            actions: ["sts:AssumeRoleWithWebIdentity"],
            principals: [{
                type: "Federated",
                identifiers: [`arn:aws:iam::${current.accountId}:oidc-provider/${oidcProvider}`],
            }],
            conditions: [
                {
                    test: "StringEquals",
                    variable: `${oidcProvider}:sub`,
                    values: ["system:serviceaccount:kube-system:ebs-csi-controller-sa"],
                },
                {
                    test: "StringEquals",
                    variable: `${oidcProvider}:aud`,
                    values: ["sts.amazonaws.com"],
                },
            ],
        }],
    });
    const aws_ebs_csi_driver = new aws.iam.Role("aws-ebs-csi-driver", {
        name: `aptos-${workspaceName}-ebs-csi-controller`,
        path: iamPath,
        permissionsBoundary: permissionsBoundaryPolicy,
        assumeRolePolicy: aws_ebs_csi_driver_trust_policy.apply(aws_ebs_csi_driver_trust_policy => aws_ebs_csi_driver_trust_policy.json),
    });
    const caws_ebs_csi_driver = new aws.iam.RolePolicyAttachment("caws-ebs-csi-driver", {
        role: aws_ebs_csi_driver.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
    });
    const aws_ebs_csi_driverResource = new aws.eks.Addon("aws-ebs-csi-driver", {
        clusterName: aptosResource.name,
        addonName: "aws-ebs-csi-driver",
        serviceAccountRoleArn: aws_ebs_csi_driver.arn,
    });
    const kubeconfig = std.md5Output({
        input: (await std.timestamp({})).result,
    }).apply(invoke => `/tmp/kube.config.${invoke.result}`);
    const monitoringHelmChartPath = `${notImplemented("path.module")}/../../helm/monitoring`;
    const loggerHelmChartPath = `${notImplemented("path.module")}/../../helm/logger`;
    const aptosNodeHelmChartPath = helmChart != "" ? helmChart : `${notImplemented("path.module")}/../../helm/aptos-node`;
    const delete_gp2 = new _null.Resource("delete-gp2", {});
    const delete_gp2Provisioner0 = new command.local.Command("delete-gp2Provisioner0", {create: pulumi.interpolate`aws --region ${region} eks update-kubeconfig --name ${aptosResource.name} --kubeconfig ${kubeconfig} &&
kubectl --kubeconfig ${kubeconfig} delete --ignore-not-found storageclass gp2
`}, {
        dependsOn: [delete_gp2],
    });
    const gp3 = new kubernetes.index.StorageClass("gp3", {
        metadata: [{
            name: "gp3",
            annotations: {
                "storageclass.kubernetes.io/is-default-class": false,
            },
        }],
        storageProvisioner: "ebs.csi.aws.com",
        volumeBindingMode: "WaitForFirstConsumer",
        parameters: {
            type: "gp3",
        },
    });
    const io1 = new kubernetes.index.StorageClass("io1", {
        metadata: [{
            name: "io1",
        }],
        storageProvisioner: "kubernetes.io/aws-ebs",
        volumeBindingMode: "WaitForFirstConsumer",
        parameters: {
            type: "io1",
            iopsPerGB: "50",
        },
    });
    const io2 = new kubernetes.index.StorageClass("io2", {
        metadata: [{
            name: "io2",
        }],
        storageProvisioner: "ebs.csi.aws.com",
        volumeBindingMode: "WaitForFirstConsumer",
        parameters: {
            type: "io2",
            iops: "40000",
        },
    });
    const tigera_operator = new kubernetes.index.Namespace("tigera-operator", {metadata: [{
        annotations: {
            name: "tigera-operator",
        },
        name: "tigera-operator",
    }]});
    const calico: helm.index.Release[] = [];
    for (const range = {value: 0}; range.value < (enableCalico ? 1 : 0); range.value++) {
        calico.push(new helm.index.Release(`calico-${range.value}`, {
            name: "calico",
            repository: "https://docs.tigera.io/calico/charts",
            chart: "tigera-operator",
            version: "3.26.0",
            namespace: "tigera-operator",
        }));
    }
    const helmReleaseName = helmReleaseNameOverride != "" ? helmReleaseNameOverride : workspaceName;
    const logger: helm.index.Release[] = [];
    for (const range = {value: 0}; range.value < (enableLogger ? 1 : 0); range.value++) {
        logger.push(new helm.index.Release(`logger-${range.value}`, {
            name: `${helmReleaseName}-log`,
            chart: loggerHelmChartPath,
            maxHistory: 5,
            wait: false,
            values: [
                JSON.stringify({
                    logger: {
                        name: "aptos-logger",
                    },
                    chain: {
                        name: chainName,
                    },
                    serviceAccount: {
                        create: false,
                        name: helmReleaseName == "aptos-node" ? "aptos-node-validator" : `${helmReleaseName}-aptos-node-validator`,
                    },
                }),
                JSON.stringify(loggerHelmValues),
            ],
            set: [{
                name: "chart_sha1",
                value: std.sha1Output({
                    input: std.joinOutput({
                        separator: "",
                        input: .map(f => (std.filesha1Output({
                            input: `${loggerHelmChartPath}/${f}`,
                        }).result)),
                    }).result,
                }).result,
            }],
        }));
    }
    const myhelmValues = domain.apply(domain => JSON.stringify({
        numValidators: numValidators,
        numFullnodeGroups: numFullnodeGroups,
        imageTag: imageTag,
        manageImages: manageViaTf,
        chain: {
            era: era,
            chainId: chainId,
            name: chainName,
        },
        validator: {
            name: validatorName,
            storage: {
                "class": validatorStorageClass,
            },
            nodeSelector: {
                "eks.amazonaws.com/nodegroup": "validators",
            },
            tolerations: [{
                key: "aptos.org/nodepool",
                value: "validators",
                effect: "NoExecute",
            }],
            remoteLogAddress: enableLogger ? `${logger[0].name}-aptos-logger.${logger[0].namespace}.svc:5044` : undefined,
        },
        fullnode: {
            storage: {
                "class": fullnodeStorageClass,
            },
            nodeSelector: {
                "eks.amazonaws.com/nodegroup": "validators",
            },
            tolerations: [{
                key: "aptos.org/nodepool",
                value: "validators",
                effect: "NoExecute",
            }],
        },
        haproxy: {
            nodeSelector: {
                "eks.amazonaws.com/nodegroup": "utilities",
            },
        },
        service: {
            domain: domain,
        },
    }));
    const validatorResource: helm.index.Release[] = [];
    for (const range = {value: 0}; range.value < (helmEnableValidator ? 1 : 0); range.value++) {
        validatorResource.push(new helm.index.Release(`validator-${range.value}`, {
            set: Object.entries(manageViaTf ? notImplemented("toset([\"\"])") : notImplemented("toset([])")).map(([k, v]) => ({key: k, value: v})).map(entry => ({
                name: "chart_sha1",
                value: std.sha1Output({
                    input: std.joinOutput({
                        separator: "",
                        input: .map(f => (std.filesha1Output({
                            input: `${aptosNodeHelmChartPath}/${f}`,
                        }).result)),
                    }).result,
                }).result,
            })),
            name: helmReleaseName,
            chart: aptosNodeHelmChartPath,
            maxHistory: 5,
            wait: false,
            values: [
                myhelmValues,
                helmValuesFile != "" ? std.fileOutput({
                    input: helmValuesFile,
                }).result : "{}",
                JSON.stringify(helmValues),
            ],
        }));
    }
    const monitoring: helm.index.Release[] = [];
    for (const range = {value: 0}; range.value < (enableMonitoring ? 1 : 0); range.value++) {
        monitoring.push(new helm.index.Release(`monitoring-${range.value}`, {
            name: `${helmReleaseName}-mon`,
            chart: monitoringHelmChartPath,
            maxHistory: 5,
            wait: false,
            values: [
                JSON.stringify({
                    chain: {
                        name: chainName,
                    },
                    validator: {
                        name: validatorName,
                    },
                    service: {
                        domain: domain,
                    },
                    monitoring: {
                        prometheus: {
                            storage: {
                                "class": gp3.metadata[0].name,
                            },
                        },
                    },
                    "kube-state-metrics": {
                        enabled: enableKubeStateMetrics,
                    },
                    "prometheus-node-exporter": {
                        enabled: enablePrometheusNodeExporter,
                    },
                }),
                JSON.stringify(monitoringHelmValues),
            ],
            set: [{
                name: "chart_sha1",
                value: std.sha1Output({
                    input: std.joinOutput({
                        separator: "",
                        input: .map(f => (std.filesha1Output({
                            input: `${monitoringHelmChartPath}/${f}`,
                        }).result)),
                    }).result,
                }).result,
            }],
        }));
    }
    const debug = new kubernetes.index.ClusterRole("debug", {
        metadata: [{
            name: "debug",
        }],
        rule: [{
            apiGroups: [""],
            resources: [
                "pods/portforward",
                "pods/exec",
            ],
            verbs: ["create"],
        }],
    });
    const debuggers = new kubernetes.index.RoleBinding("debuggers", {
        metadata: [{
            name: "debuggers",
        }],
        roleRef: [{
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: debug.metadata[0].name,
        }],
        subject: [{
            kind: "Group",
            name: "debuggers",
        }],
    });
    const viewers = new kubernetes.index.RoleBinding("viewers", {
        metadata: [{
            name: "viewers",
        }],
        roleRef: [{
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: "view",
        }],
        subject: [
            {
                kind: "Group",
                name: "viewers",
            },
            {
                kind: "Group",
                name: "debuggers",
            },
        ],
    });
    const aws_auth = new kubernetes.index.ConfigMap("aws-auth", {
        metadata: [{
            name: "aws-auth",
            namespace: "kube-system",
        }],
        data: {
            mapRoles: notImplemented(`yamlencode(concat(
[{
rolearn=aws_iam_role.nodes.arn
username="system:node:{{EC2PrivateDNSName}}"
groups=["system:bootstrappers","system:nodes"]
}],
var.iam_path=="/"?[]:[{
# Workaround for https://github.com/kubernetes-sigs/aws-iam-authenticator/issues/268
# The entry above is still needed otherwise EKS marks the node group as unhealthy
rolearn=replace(aws_iam_role.nodes.arn,"role\${var.iam_path}","role/")
username="system:node:{{EC2PrivateDNSName}}"
groups=["system:bootstrappers","system:nodes"]
}],
[forroleinvar.k8s_admin_roles:{
rolearn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/\${role}"
username="\${role}:{{SessionName}}"
groups=["system:masters"]
}],
[forroleinvar.k8s_viewer_roles:{
rolearn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/\${role}"
username="\${role}:{{SessionName}}"
groups=["viewers"]
}],
[forroleinvar.k8s_debugger_roles:{
rolearn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/\${role}"
username="\${role}:{{SessionName}}"
groups=["debuggers"]
}],
))`),
            mapUsers: notImplemented(`yamlencode(concat(
[foruserinvar.k8s_admins:{
userarn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:user/\${user}"
username=user
groups=["system:masters"]
}],
[foruserinvar.k8s_viewers:{
userarn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:user/\${user}"
username=user
groups=["viewers"]
}],
[foruserinvar.k8s_debuggers:{
userarn="arn:aws:iam::\${data.aws_caller_identity.current.account_id}:user/\${user}"
username=user
groups=["debuggers"]
}],
))`),
        },
    });
    const all = kubernetes.index.allNamespaces({});
    const kubernetesMasterVersion = std.substrOutput({
        input: aptosResource.version,
        length: 0,
        offset: 4,
    }).apply(invoke => invoke.result);
    const baselinePssLabels = {
        "pod-security.kubernetes.io/audit": "baseline",
        "pod-security.kubernetes.io/warn": "baseline",
        "pod-security.kubernetes.io/enforce": "privileged",
    };
    // FIXME: Remove when migrating to K8s 1.25
    const disable_psp: kubernetes.index.RoleBinding[] = [];
    for (const range = {value: 0}; range.value < notImplemented("toset(local.kubernetes_master_version<=\"1.24\"?data.kubernetes_all_namespaces.all.namespaces:[])"); range.value++) {
        disable_psp.push(new kubernetes.index.RoleBinding(`disable-psp-${range.value}`, {
            metadata: [{
                name: "privileged-psp",
                namespace: range.value,
            }],
            roleRef: [{
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "eks:podsecuritypolicy:privileged",
            }],
            subject: [{
                apiGroup: "rbac.authorization.k8s.io",
                kind: "Group",
                name: `system:serviceaccounts:${range.value}`,
            }],
        }));
    }
    // FIXME: Remove when migrating to K8s 1.25
    const delete_psp_authenticated: _null.Resource[] = [];
(kubernetesMasterVersion <= 1.24 ? 1 : 0).apply(rangeBody => {
        for (const range = {value: 0}; range.value < rangeBody; range.value++) {
            delete_psp_authenticated.push(new _null.Resource(`delete-psp-authenticated-${range.value}`, {}));
        }
    });
    const delete_psp_authenticatedProvisioner0 = new command.local.Command("delete-psp-authenticatedProvisioner0", {create: pulumi.interpolate`aws --region ${region} eks update-kubeconfig --name ${aptosResource.name} --kubeconfig ${kubeconfig} &&
kubectl --kubeconfig ${kubeconfig} delete --ignore-not-found clusterrolebinding eks:podsecuritypolicy:authenticated
`}, {
        dependsOn: [delete_psp_authenticated],
    });
    const pss_default = new kubernetes.index.Labels("pss-default", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: [{
            name: "default",
        }],
        labels: baselinePssLabels,
    });
    return {
        helmReleaseName: validatorResource[0].name,
        awsEksCluster: aptosResource,
        awsEksClusterAuthToken: aptos.apply(aptos => aptos.token),
        oidcProvider: oidcProvider,
        validatorEndpoint: zoneId == "" || !createRecords ? undefined : pulumi.interpolate`/dns4/${validator[0].fqdn}/tcp/${validator_lb[0].spec[0].port[0].port}`,
        fullnodeEndpoint: zoneId == "" || !createRecords ? undefined : pulumi.interpolate`/dns4/${fullnode[0].fqdn}/tcp/${fullnode_lb[0].spec[0].port[0].port}`,
        vpcId: vpc.id,
        awsSubnetPublic: _public,
        awsSubnetPrivate: _private,
        awsVpcCidrBlock: vpc.cidrBlock,
        awsEipNatPublicIp: nat.publicIp,
        clusterSecurityGroupId: aptosResource.vpcConfig.apply(vpcConfig => vpcConfig.clusterSecurityGroupId),
    };
}

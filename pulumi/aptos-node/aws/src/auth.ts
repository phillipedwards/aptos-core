import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface AuthConfig {
    workspaceName: string;
    iamPath: string;
    permissionsBoundaryPolicy?: string;
}

export class Auth extends pulumi.ComponentResource {
    public readonly clusterRole: aws.iam.Role;
    public readonly nodesRole: aws.iam.Role;
    public readonly clusterPolicyAttachment: aws.iam.RolePolicyAttachment;
    public readonly nodesPolicyAttachment: aws.iam.RolePolicyAttachment;
    public readonly nodesInstanceProfile: aws.iam.InstanceProfile;
    public readonly nodesCniPolicyAttachment: aws.iam.RolePolicyAttachment;
    public readonly nodesEcrPolicyAttachment: aws.iam.RolePolicyAttachment;

    constructor(name: string, args: AuthConfig, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Auth", name, {}, opts);

        this.clusterRole = new aws.iam.Role(`cluster`, {
            name: `aptos-${args.workspaceName}-cluster`,
            path: args.iamPath,
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Principal: {
                            Service: "ec2.amazonaws.com"
                        },
                        Effect: "Allow",
                    }
                ]
            }),
            permissionsBoundary: args.permissionsBoundaryPolicy,
        }, { parent: this });

        this.nodesRole = new aws.iam.Role(`nodes`, {
            name: `aptos-${args.workspaceName}-nodes`,
            path: args.iamPath,
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Principal: {
                            Service: "ec2.amazonaws.com"
                        },
                        Effect: "Allow",
                    }
                ]
            })
        }, { parent: this });

        this.clusterPolicyAttachment = new aws.iam.RolePolicyAttachment(`cluster-cluster`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
            role: this.clusterRole.name,
        }, { parent: this });

        this.nodesPolicyAttachment = new aws.iam.RolePolicyAttachment(`cluster-service`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
            role: this.nodesRole.name,
        }, { parent: this });

        this.nodesPolicyAttachment = new aws.iam.RolePolicyAttachment(`nodes-node`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            role: this.nodesRole.name,
        }, { parent: this });

        this.nodesInstanceProfile = new aws.iam.InstanceProfile(`nodes`, {
            name: `nodes`,
            role: this.nodesRole.name,
        }, { parent: this });

        this.nodesCniPolicyAttachment = new aws.iam.RolePolicyAttachment(`nodes-cni`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
            role: this.nodesRole.name,
        }, { parent: this });

        this.nodesEcrPolicyAttachment = new aws.iam.RolePolicyAttachment(`nodes-ecr`, {
            policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
            role: this.nodesRole.name,
        }, { parent: this });

        this.registerOutputs({
            clusterRole: this.clusterRole,
            nodesRole: this.nodesRole,
            clusterPolicyAttachment: this.clusterPolicyAttachment,
            nodesPolicyAttachment: this.nodesPolicyAttachment,
            nodesInstanceProfile: this.nodesInstanceProfile,
            nodesCniPolicyAttachment: this.nodesCniPolicyAttachment,
            nodesEcrPolicyAttachment: this.nodesEcrPolicyAttachment,
        });
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface AuthConfig {
    iamPath: pulumi.Input<string>;
    permissionsBoundaryPolicy?: pulumi.Input<string>;
}

export interface AuthArgs extends AuthConfig {
    workspaceName: pulumi.Input<string>;
}

export class Auth extends pulumi.ComponentResource {
    public readonly clusterRole: aws.iam.Role;
    public readonly nodesRole: aws.iam.Role;
    public readonly nodesInstanceProfile: aws.iam.InstanceProfile;

    constructor(name: string, args: AuthArgs, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:aws:Auth", name, {}, opts);

        this.clusterRole = new aws.iam.Role(`cluster`, {
            name: `aptos-${args.workspaceName}-cluster`,
            path: args.iamPath,
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com"
                        },
                    }
                ]
            }),
            managedPolicyArns: [
                "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
                "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
            ],
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
            }),
            managedPolicyArns: [
                "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
                "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
                "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            ],
        }, { parent: this });

        this.nodesInstanceProfile = new aws.iam.InstanceProfile(`nodes`, {
            name: pulumi.interpolate`aptos-${args.workspaceName}-nodes`,
            role: this.nodesRole.name,
        }, { parent: this });

        this.registerOutputs({
            clusterRole: this.clusterRole,
            nodesRole: this.nodesRole,
        });
    }
}

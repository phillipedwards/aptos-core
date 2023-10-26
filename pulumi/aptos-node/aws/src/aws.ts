import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as config from './config';
import { defaultTags } from '@pulumi/aws/config';

export const awsProvider = new aws.Provider("aws", {
    region: "us-west-2",
    profile: config.profile,
    defaultTags: {
        tags: {
            "pulumi": "validator",
            "pulumi/organziation": pulumi.getOrganization(),
            "pulumi/project": pulumi.getProject(),
            "pulumi/stack": pulumi.getStack(),
            "kubernetes.io/cluster/aptos-default": "owned",
        }
    }
}, { aliases: ["urn:pulumi:sandbox::aws::pulumi:providers:aws::default_5_42_0"] });

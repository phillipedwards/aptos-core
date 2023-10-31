import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as config from './config';
import { defaultTags } from '@pulumi/aws/config';

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region") || process.env.AWS_REGION;
const profile = awsConfig.require("profile") || process.env.AWS_REGION;
const defaultProviderConfig = new pulumi.Config("awsDefaultProvider");
const k8sDefaultProviderAlias = defaultProviderConfig.get("k8sDefaultProviderAlias");

export const awsProvider = new aws.Provider("aws", {
    // TODO: fix region configurability
    region: "us-west-2",
    accessKey: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : undefined,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : undefined,
    profile: process.env.AWS_PROFILE ? process.env.AWS_PROFILE : undefined,
    defaultTags: {
        tags: {
            "pulumi": "validator",
            "pulumi/organziation": pulumi.getOrganization(),
            "pulumi/project": pulumi.getProject(),
            "pulumi/stack": pulumi.getStack(),
            "kubernetes.io/cluster/aptos-default": "owned",
        }
    }
}, { aliases: k8sDefaultProviderAlias ? [k8sDefaultProviderAlias] : [] });

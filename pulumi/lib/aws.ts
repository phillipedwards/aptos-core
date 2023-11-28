import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { defaultTags } from '@pulumi/aws/config';


const awsConfig = new pulumi.Config("aws");
export const profile: pulumi.Input<string> | undefined = awsConfig.get("profile") || process.env.AWS_PROFILE;
export const region: pulumi.Input<string> = awsConfig.require("region");
export const defaultProviderUrn: pulumi.Input<string> | undefined = awsConfig.get("defaultProviderUrn") || undefined;


export const awsProvider = new aws.Provider("aws2", {
    // todo: fix region
    region: "us-west-2",
    accessKey: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : undefined,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : undefined,
    profile: profile,
    defaultTags: {
        tags: {
            "pulumi": "validator",
            "pulumi/organziation": pulumi.getOrganization(),
            "pulumi/project": pulumi.getProject(),
            "pulumi/stack": pulumi.getStack(),
            "kubernetes.io/cluster/aptos-default": "owned",
        }
    }
}, {
    // aliases: [config.defaultProviderUrn] 
});

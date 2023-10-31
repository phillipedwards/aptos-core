import * as pulumi from "@pulumi/pulumi";

// AWS Config
export const awsConfig = new pulumi.Config("aws");
export const region: pulumi.Input<string> = awsConfig.require("region");
export const profile: pulumi.Input<string> = awsConfig.require("profile");
export const defaultProviderUrn: pulumi.Input<string> = awsConfig.require("defaultProviderUrn");

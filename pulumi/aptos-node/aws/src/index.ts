import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { AptosNodeAWS } from "./aptosNodeAWS";
import * as transformations from './transformation';
import { awsProvider } from './aws'

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

const aptosNodeAWS = new AptosNodeAWS("aptos-node-aws");

// export const oidcProvider = aptosNodeAWS.oidcProvider;

// // Network
// export const awsEipNatPublicIp = aptosNodeAWS.awsEipNatPublicIp;
// export const awsSubnetPrivate = aptosNodeAWS.awsSubnetPrivate;
// export const awsSubnetPublic = aptosNodeAWS.awsSubnetPublic;
// export const awsVpcCidrBlock = aptosNodeAWS.awsVpcCidrBlock;
// export const clusterSecurityGroupId = aptosNodeAWS.clusterSecurityGroupId;
// export const vpcId = aptosNodeAWS.vpcId;

// // Cluster
// export const awsEksCluster = aptosNodeAWS.awsEksCluster;
// export const awsEksClusterAuthToken = aptosNodeAWS.awsEksClusterAuthToken;
// export const kubeConfig = aptosNodeAWS.kubeConfig;

// // Validator
// export const fullnodeEndpoint = aptosNodeAWS.fullnodeEndpoint;
// export const helmReleaseName = aptosNodeAWS.helmReleaseName;
// export const validatorEndpoint = aptosNodeAWS.validatorEndpoint;

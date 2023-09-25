import { AptosNodeAWS } from "./aptosNodeAWS";

const aptosNodeAWS = new AptosNodeAWS("aptos-node-aws");

export const oidcProvider = aptosNodeAWS.oidcProvider;

// Network
export const awsEipNatPublicIp = aptosNodeAWS.awsEipNatPublicIp;
export const awsSubnetPrivate = aptosNodeAWS.awsSubnetPrivate;
export const awsSubnetPublic = aptosNodeAWS.awsSubnetPublic;
export const awsVpcCidrBlock = aptosNodeAWS.awsVpcCidrBlock;
export const clusterSecurityGroupId = aptosNodeAWS.clusterSecurityGroupId;
export const vpcId = aptosNodeAWS.vpcId;

// Cluster
export const awsEksCluster = aptosNodeAWS.awsEksCluster;
export const awsEksClusterAuthToken = aptosNodeAWS.awsEksClusterAuthToken;
export const kubeConfig = aptosNodeAWS.kubeConfig;

// Validator
export const fullnodeEndpoint = aptosNodeAWS.fullnodeEndpoint;
export const helmReleaseName = aptosNodeAWS.helmReleaseName;
export const validatorEndpoint = aptosNodeAWS.validatorEndpoint;

import * as gcp from "@pulumi/gcp";
import * as pulumi from '@pulumi/pulumi';
import { AptosNodeGCP } from "./aptosNodeGCP";
import * as transformations from './transformation';

const services = [
    "clouderrorreporting.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "container.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
    "spanner.googleapis.com",
];

const serviceResources: { [key: string]: gcp.projects.Service } = {};

// Register the alias transformation on the stack to import from `pulumi import from...`
pulumi.log.info(`Registering aliasTransformation transformation`);
pulumi.runtime.registerStackTransformation(transformations.aliasTransformation);
// Register the addImports transformation on the stack to import from other state
pulumi.log.info(`Registering addImports transformation`);
pulumi.runtime.registerStackTransformation(transformations.addImports);

for (const service of services) {
    serviceResources[service] = new gcp.projects.Service(`services-${service}`, {
        service: service,
        disableOnDestroy: false,
    });
}

const aptosNodeGCP = new AptosNodeGCP("aptos-node-gcp");

export const helmReleaseName = aptosNodeGCP.helmReleaseName
export const gkeClusterEndpoint = aptosNodeGCP.gkeClusterEndpoint
export const gkeClusterCaCertificate = aptosNodeGCP.gkeClusterCaCertificate
export const gkeClusterWorkloadIdentityConfig = aptosNodeGCP.gkeClusterWorkloadIdentityConfig



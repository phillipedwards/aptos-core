import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/gcp';

import {
    // GCP Configurations
    // Aptos Configurations
    // DNS Configurations
    // Helm Configurations
    // Kubernetes User Configurations
    // IAM Configurations
    // VPC Configurations
    // Utility Node Configurations
    // Validator Node Configurations
    // Monitoring and Logging Configurations
    // Miscellaneous Configurations
} from "./config";

import { Auth } from "./auth";
import { Cluster } from "./cluster";
import { Dns } from "./dns";
import { Network } from "./network";
import { Kubernetes } from "./kubernetes";
import { Security } from "./security";


export class AptosNodeGCP extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("aptos-node:gcp:AptosNodeGCP", name, opts);
    }
}

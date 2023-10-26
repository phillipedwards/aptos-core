import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LocalWorkspace, Stack } from "@pulumi/pulumi/automation";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { execSync } from "child_process";


const run = async () => {
    const argv = yargs(hideBin(process.argv))
        .option("stackName", {
            alias: "s",
            description: "Name of the Pulumi stack",
            type: "string",
        })
        .demandOption(["stackName"])
        .help()
        .argv;

    const stackName = argv.stackName;


    // Backup Pulumi state file
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "");
    const backupFile = `pulumi-state-backup-${timestamp}.json`;
    execSync(`pulumi stack export --stack ${stackName} > ${backupFile}`);
    console.log(`Pulumi state backed up to ${backupFile}`);

    // Initialize Pulumi Automation API
    const stack = await Stack.select(stackName);

    // Get AWS profile from stack config
    const config = await stack.getConfig();
    const awsProfile = config["aws:profile"];
    console.log(`AWS Profile: ${awsProfile}`);

    // Delete specified AWS IAM RolePolicyAttachments
    const rolePolicyAttachments = [
        "cluster-cluster",
        "caws-ebs-csi-driver",
        "cluster-service",
        "nodes-ecr",
        "nodes-node",
        "nodes-cni",
    ];

    for (const attachment of rolePolicyAttachments) {
        try {
            await stack.removeResource(attachment);
            console.log(`Successfully deleted RolePolicyAttachment ${attachment}`);
        } catch (error) {
            console.error(`Failed to delete RolePolicyAttachment ${attachment}: ${error}`);
        }
    }
};

run().catch((err) => console.log(`An error occurred: ${err}`));

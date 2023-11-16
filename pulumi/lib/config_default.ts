import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as std from "@pulumi/std";

interface WorkspaceNameArgs {
    workspaceNameOverride: pulumi.Input<string>;
    pulumiStackName: pulumi.Input<string>;
    pulumiProjectName: pulumi.Input<string>;
    pulumiOrgName: pulumi.Input<string>;
}

export function workspaceName(args: WorkspaceNameArgs): pulumi.Input<string> {
    if (args.workspaceNameOverride) {
        return args.workspaceNameOverride;
    } else {
        return pulumi.interpolate`${args.pulumiStackName}-${args.pulumiProjectName}-${args.pulumiOrgName}`;
    }
}

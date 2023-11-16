import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as std from "@pulumi/std";
import * as crypto from "crypto";
import * as k8s from "@pulumi/kubernetes";
import * as fs from "fs";

export function computeSha1ForHelmRelease(chartPathOutput: Promise<std.AbspathResult>): crypto.Hash {
    const filesOutput = pulumi.all([chartPathOutput]).apply(([path]) => {
        return fs.readdirSync(path.result);
    });

    let sha1sumForHelmRelease: crypto.Hash[] = [];

    pulumi.all([filesOutput, chartPathOutput]).apply(([files, path]) => {
        for (const f of files) {
            const fullPath = `${path.result}/${f}`;
            if (fs.statSync(fullPath).isDirectory()) {
                continue; // Skip directories
            }
            sha1sumForHelmRelease.push(crypto.createHash("sha1"));
            const data = fs.readFileSync(fullPath);
            sha1sumForHelmRelease[sha1sumForHelmRelease.length - 1].update(data);
        }
    });

    return crypto.createHash("sha1").update(sha1sumForHelmRelease.map((h) => h.digest()).join(""));
}

export function getDnsRecordNameFromPatternWithWorkspaceName(pattern: pulumi.Input<string> | undefined, workspaceName: pulumi.Input<string>): pulumi.Output<string> {
    return pulumi.all([pattern, workspaceName]).apply(([pattern, workspaceName]) => {
        if (pattern) {
            return pattern.replace("<workspace>", workspaceName);
        }
        else {
            return `${workspaceName}.aptos`;
        }
    });
}

export function setAWSProviderOnEachAWSResource(awsProvider: aws.Provider): pulumi.ResourceTransformation {
    return (args: pulumi.ResourceTransformationArgs): pulumi.ResourceTransformationResult => {
        args.opts.provider = args.opts.provider || undefined;
        if (args.type.startsWith("aws:")) {
            args.opts.provider = awsProvider;
        }
        return {
            props: args.props,
            opts: args.opts,
        };
    };
}

export function setK8sProviderOnEachK8sResource(k8sProvider: k8s.Provider): pulumi.ResourceTransformation {
    return (args: pulumi.ResourceTransformationArgs): pulumi.ResourceTransformationResult => {
        args.opts.provider = args.opts.provider || undefined;
        if (args.type.startsWith("kubernetes:")) {
            args.opts.provider = k8sProvider;
        }
        return {
            props: args.props,
            opts: args.opts,
        };
    };
}

export const aliasTransformation: pulumi.ResourceTransformation = (args) => {
    args.opts.aliases = args.opts.aliases || []
    args.opts.aliases.push(
        {
            type: args.type,
            name: args.name,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}_0`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}_1`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}_2`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}_3`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}_4`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}-0`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}-1`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}-2`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}-3`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}-4`,
            parent: pulumi.rootStackResource
        },
    )

    return {
        props: args.props,
        opts: args.opts,
    };
};

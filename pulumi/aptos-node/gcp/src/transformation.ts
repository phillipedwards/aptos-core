import * as pulumi from '@pulumi/pulumi';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import {
    enableMonitoring,
    enableLogging,
    enableNodeExporter,
} from "./config";

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
            name: pulumi.interpolate`${args.name}_1`,
            parent: pulumi.rootStackResource
        },
        {
            type: args.type,
            name: pulumi.interpolate`${args.name}_2`,
            parent: pulumi.rootStackResource
        }
    )

    return {
        props: args.props,
        opts: args.opts,
    };
};

export const addImports: pulumi.ResourceTransformation = (args) => {
    const { type, name } = args;

    // pulumi.log.info(`addImports transformation: ${type}:${name}`);

    switch (type) {
        case "kubernetes:helm.sh/v3:Release":
            switch (name) {
                case "validator":
                    args.opts = pulumi.mergeOptions(args.opts, {
                        import: "default/default",
                    });
                    break;
                case "logger":
                    args.opts = pulumi.mergeOptions(args.opts, {
                        import: "default/default-log",
                    });
                    break;
                case "monitoring":
                    args.opts = pulumi.mergeOptions(args.opts, {
                        import: "default/default-mon",
                    });
                    break;
            }
            break;
        case "gcp:projects/iAMMember:IAMMember":
            switch (name) {
                case "gke-logging":
                    args.opts = pulumi.mergeOptions(args.opts, {
                        import: "geoff-miller-pulumi-corp-play roles/logging.logWriter serviceAccount:aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
                    });
                    break;
                case "gke-metrics":
                    args.opts = pulumi.mergeOptions(args.opts, {
                        import: "geoff-miller-pulumi-corp-play roles/monitoring.metricWriter serviceAccount:aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
                    });
                    break;
                case "gke-monitoring":
                    args.opts = pulumi.mergeOptions(args.opts, {
                        import: "geoff-miller-pulumi-corp-play roles/monitoring.viewer serviceAccount:aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com",
                    });
                    break;
            }
            break;
        case "gcp:projects/iAMCustomRole:IAMCustomRole":
            if (name === "k8s-debugger-custom-role") {
                args.opts = pulumi.mergeOptions(args.opts, {
                    import: "projects/geoff-miller-pulumi-corp-play/roles/container.debugger.08feee41",
                });
            }
            break;
    }

    return args;
}

function configTrueToBool(key: string, value: any) {
    // if key contains "enabled" or "enable" and value is "true" or "false"
    if (key.includes("enabled") || key.includes("enable")) {
        if (value === "true") {
            return true;
        } else if (value === "false") {
            return false;
        }
    }
    // Return the original value if it's not a string or couldn't be parsed
    return value;
}

// type: kubernetes:helm.sh/v3: Release
//   name: validator
//   import: "default/default",


// type: gcp:projects:IAMMember
// - name: gke-logging
//   import: `geoff-miller-pulumi-corp-play roles/logging.logWriter serviceAccount:aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com`,
// - name: gke-metrics
//   import: `geoff-miller-pulumi-corp-play roles/monitoring.metricWriter serviceAccount:aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com`,
// - name: gke-monitoring
//   import: `geoff-miller-pulumi-corp-play roles/monitoring.viewer serviceAccount:aptos-default-gke@geoff-miller-pulumi-corp-play.iam.gserviceaccount.com`,


// type: gcp:projects:IAMCustomRole
// - name: k8s-debugger-custom-role
//   import: `projects/geoff-miller-pulumi-corp-play/roles/container.debugger.08feee41`,


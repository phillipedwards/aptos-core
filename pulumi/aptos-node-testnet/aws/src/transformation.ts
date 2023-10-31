import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { awsProvider } from './aws'

export const setAWSProviderOnEachAWSResource: pulumi.ResourceTransformation = (args) => {
    args.opts.provider = args.opts.provider || undefined;
    if (args.type.startsWith("aws:")) {
        args.opts.provider = awsProvider;
    }
    return {
        props: args.props,
        opts: args.opts,
    };
};

// export const isTaggableAWS: pulumi.ResourceTransformation = (args) => {
//     // if (args.type.startsWith("aws:") && args.props.hasOwnProperty("tags")) {
//     // pulumi.log.info(JSON.stringify(args.props))
//     args.props.tags = args.props.tags || {};
//     // add common tags to the "tags" property
//     // pulumi.log.info(`Transformation | isTaggable: ${args.type}: true`)
//     // } else {
//     // pulumi.log.info(`Transformation | isTaggable: ${args.type}: false`)
//     // }
//     return {
//         props: args.props,
//         opts: args.opts,
//     };
// };

// export const commonTags: pulumi.ResourceTransformation = (args) => {
//     args.props.tags = args.props.tags || {}
//     // pulumi.log.info(`Transformation | commonTags: ${args.type}`)

//     return {
//         props: args.props,
//         opts: args.opts,
//     };
// };

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
    }

    return args;
}


// type: kubernetes:helm.sh/v3: Release
//   name: validator
//   import: "default/default",


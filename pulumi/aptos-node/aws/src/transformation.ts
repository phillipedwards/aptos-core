import * as pulumi from '@pulumi/pulumi';

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

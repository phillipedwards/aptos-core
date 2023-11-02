import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as std from "@pulumi/std";
import * as crypto from "crypto";
import * as fs from "fs";

export function computeSha1ForHelmRelease(chartPathOutput: Promise<std.AbspathResult>): crypto.Hash {
    const filesOutput = pulumi.all([chartPathOutput]).apply(([path]) => {
        return fs.readdirSync(path.result);
    });

    let sha1sumForHelmRelease = crypto.createHash('sha1');

    pulumi.all([filesOutput, chartPathOutput]).apply(([files, path]) => {
        for (const f of files) {
            const data = fs.readFileSync(`${path}/${f}`);
            sha1sumForHelmRelease.update(data);
        }
    });

    return sha1sumForHelmRelease;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bucketName = void 0;
const gcp = require("@pulumi/gcp");
// Create a GCP resource (Storage Bucket)
const bucket = new gcp.storage.Bucket("my-bucket", {
    location: "US"
});
// Export the DNS name of the bucket
exports.bucketName = bucket.url;
//# sourceMappingURL=index.js.map
## Typescript Import naming

The following is how these packages should be imported:

```
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
```

##

convert this file: /Users/geoff/code/se/aptos/aptos-core/pulumi/aptos-node/gcp/archive/kubernetes.tf

be sure to create it as a component.

Be sure to create a kubernetesConfig interface

be sure to include all of the resources in the terraform:

resource "kubernetes_storage_class" "ssd"
resource "helm_release" "validator"
resource "helm_release" "logger"
resource "helm_release" "monitoring"
resource "helm_release" "node_exporter"


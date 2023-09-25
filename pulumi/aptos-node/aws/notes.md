## Resource Naming

Also, do not change tag values. Don't add or remove anything from the tag. Try to make them equivelant.

## AWS considerations

Always prioritize the use of the aws package. Please steer clear of the awsx and aws-native packages.

## Typescript Import naming

The following is how these packages should be imported:

```
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
```


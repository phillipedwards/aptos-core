region          = "us-west-2"             # Specify the region
validator_name  = "gmvalidator"           # Specify your validator node owner
k8s_api_sources = ["0.0.0.0/0"]           # Optionally specify IP ranges which can access the Kubernetes API
zone_id         = "Z06658773W0CXPGF3EK8K" # Optionally specify a Route 53 zone ID to create DNS records in


helm_enable_validator           = true
utility_instance_enable_taint   = true
validator_instance_enable_taint = true
enable_calico                   = true
enable_logger                   = true
enable_monitoring               = true
enable_prometheus_node_exporter = true
enable_kube_state_metrics       = true
helm_chart                      = "/aptos-core/terraform/helm/aptos-node"

# aptosNodeHelmChartPath = ""
# loggerHelmChartPath = ""
# monitoringHelmChartPath = ""
# enableValidator = ""

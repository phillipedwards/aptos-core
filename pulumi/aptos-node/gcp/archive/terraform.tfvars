#region = ""  # Specify the region
#zone = ""  # Specify the zone suffix
#validator_name = ""  # Specify your validator node owner
#k8s_api_sources = ["0.0.0.0/0"]  # Optionally specify IP ranges which can access the Kubernetes API
#zone_name = "" # Optionally specify a GCP Cloud DNS zone name to create DNS records in
#zone_project = "" # GCP project which the DNS zone is in


region          = "us-central1" # Specify the region
zone            = "a"           # Specify the zone suffix
validator_name  = "gmvalidator" # Specify your validator node owner
k8s_api_sources = ["0.0.0.0/0"] # Optionally specify IP ranges which can access the Kubernetes API
project         = "geoff-miller-pulumi-corp-play"
# zone_name       = ""              # Optionally specify a GCP Cloud DNS zone name to create DNS records in
# zone_project    = ""              # GCP project which the DNS zone is in

utility_instance_enable_taint    = true
validator_instance_enable_taint  = true
enable_logger                    = true
enable_monitoring                = true
enable_node_exporter             = true
gke_enable_node_autoprovisioning = true
gke_enable_autoscaling           = true
# helm_chart                       = "/Users/geoff/code/se/aptos/aptos-core/terraform/helm/aptos-node"
helm_chart = "/aptos-core/terraform/helm/aptos-node"

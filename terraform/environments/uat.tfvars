# UAT — promoted manually after DEV is green. Shaped like PROD so that what QA
# signs off on is representative: private subnets behind NAT, more than one
# task, autoscaling on. Sized down to keep it affordable.

environment = "uat"
aws_region  = "us-east-1"

vpc_cidr                = "10.20.0.0/16"
availability_zone_count = 2
enable_nat_gateway      = true
single_nat_gateway      = true

assign_public_ip = false

container_image = "public.ecr.aws/docker/library/node:20-alpine"
container_port  = 3000
app_version     = "uat"

desired_count            = 2
task_cpu                 = 512
task_memory              = 1024
enable_autoscaling       = true
autoscaling_min_capacity = 2
autoscaling_max_capacity = 4

health_check_path          = "/healthz"
log_retention_days         = 30
enable_deletion_protection = false

additional_tags = {
  CostCenter = "engineering"
  DataClass  = "synthetic"
}

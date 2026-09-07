# PROD — promoted manually after UAT sign-off, behind a required-reviewer gate,
# and only kept if the post-deploy smoke test passes. Three tasks across AZs,
# a NAT gateway per AZ, long log retention, deletion protection on.

environment = "prod"
aws_region  = "us-east-1"

vpc_cidr                = "10.30.0.0/16"
availability_zone_count = 3
enable_nat_gateway      = true
single_nat_gateway      = false

assign_public_ip = false

container_image = "public.ecr.aws/docker/library/node:20-alpine"
container_port  = 3000
app_version     = "prod"

desired_count            = 3
task_cpu                 = 1024
task_memory              = 2048
enable_autoscaling       = true
autoscaling_min_capacity = 3
autoscaling_max_capacity = 12

health_check_path          = "/healthz"
log_retention_days         = 90
enable_deletion_protection = true

additional_tags = {
  CostCenter = "production"
  DataClass  = "customer"
}

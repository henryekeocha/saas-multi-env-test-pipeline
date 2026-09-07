# DEV — deployed automatically on every merge to main.
# Optimised for cost and iteration speed: one task, no NAT gateway, short log
# retention, nothing protected from deletion.

environment = "dev"
aws_region  = "us-east-1"

vpc_cidr                = "10.10.0.0/16"
availability_zone_count = 2
enable_nat_gateway      = false
single_nat_gateway      = true

# No NAT in DEV, so tasks sit in public subnets to reach ECR and CloudWatch.
assign_public_ip = true

container_image = "public.ecr.aws/docker/library/node:20-alpine"
container_port  = 3000
app_version     = "dev"

desired_count      = 1
task_cpu           = 256
task_memory        = 512
enable_autoscaling = false

health_check_path          = "/healthz"
log_retention_days         = 7
enable_deletion_protection = false

additional_tags = {
  CostCenter = "engineering"
  DataClass  = "synthetic"
}

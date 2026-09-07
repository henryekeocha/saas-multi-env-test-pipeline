/**
 * Root configuration.
 *
 * One root module, three tfvars files. `terraform apply -var-file=` selects an
 * environment; nothing below is conditional on the environment name, so DEV,
 * UAT and PROD are guaranteed to be the same shape at different sizes.
 */

locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "saas-multi-env-test-pipeline"
    },
    var.additional_tags,
  )
}

module "network" {
  source = "./modules/network"

  name_prefix             = local.name_prefix
  vpc_cidr                = var.vpc_cidr
  availability_zone_count = var.availability_zone_count
  enable_nat_gateway      = var.enable_nat_gateway
  single_nat_gateway      = var.single_nat_gateway
  tags                    = local.common_tags
}

module "app_environment" {
  source = "./modules/app-environment"

  environment = var.environment
  name_prefix = local.name_prefix

  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids
  assign_public_ip   = var.assign_public_ip

  container_image = var.container_image
  container_port  = var.container_port
  app_version     = var.app_version

  desired_count            = var.desired_count
  task_cpu                 = var.task_cpu
  task_memory              = var.task_memory
  enable_autoscaling       = var.enable_autoscaling
  autoscaling_min_capacity = var.autoscaling_min_capacity
  autoscaling_max_capacity = var.autoscaling_max_capacity

  health_check_path          = var.health_check_path
  log_retention_days         = var.log_retention_days
  enable_deletion_protection = var.enable_deletion_protection
  ingress_cidr_blocks        = var.ingress_cidr_blocks

  tags = local.common_tags
}

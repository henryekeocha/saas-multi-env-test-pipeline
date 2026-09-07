output "environment" {
  description = "Environment this state represents."
  value       = var.environment
}

output "aws_region" {
  description = "Region the environment lives in."
  value       = var.aws_region
}

output "vpc_id" {
  description = "VPC ID for the environment."
  value       = module.network.vpc_id
}

output "service_url" {
  description = "Base URL of the deployed application."
  value       = module.app_environment.service_url
}

output "health_check_url" {
  description = "URL the pipeline's post-deploy smoke test polls."
  value       = module.app_environment.health_check_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name — needed to trigger a manual rollback."
  value       = module.app_environment.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS service name — needed to trigger a manual rollback."
  value       = module.app_environment.ecs_service_name
}

output "log_group_name" {
  description = "CloudWatch log group holding container logs."
  value       = module.app_environment.log_group_name
}

output "deployment_summary" {
  description = "Human-readable summary of how this environment is sized."
  value = {
    environment         = var.environment
    desired_count       = var.desired_count
    task_cpu            = var.task_cpu
    task_memory         = var.task_memory
    autoscaling         = var.enable_autoscaling ? "${var.autoscaling_min_capacity}-${var.autoscaling_max_capacity} tasks" : "disabled"
    nat_gateway         = var.enable_nat_gateway
    deletion_protected  = var.enable_deletion_protection
    rollback_on_failure = module.app_environment.circuit_breaker_rollback_enabled
  }
}

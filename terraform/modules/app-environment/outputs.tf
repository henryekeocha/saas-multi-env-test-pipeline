output "alb_dns_name" {
  description = "Public DNS name of the load balancer — the smoke-test base URL."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the load balancer, for Route 53 alias records."
  value       = aws_lb.this.zone_id
}

output "service_url" {
  description = "Base URL the environment answers on."
  value       = "http://${aws_lb.this.dns_name}"
}

output "health_check_url" {
  description = "URL the post-deploy smoke test polls."
  value       = "http://${aws_lb.this.dns_name}${var.health_check_path}"
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "Name of the ECS service (used by `aws ecs update-service` rollbacks)."
  value       = aws_ecs_service.this.name
}

output "task_definition_arn" {
  description = "ARN of the active task definition revision."
  value       = aws_ecs_task_definition.this.arn
}

output "log_group_name" {
  description = "CloudWatch log group holding container logs."
  value       = aws_cloudwatch_log_group.app.name
}

output "circuit_breaker_rollback_enabled" {
  description = "Whether ECS will auto-roll-back a failed deployment."
  value       = var.deployment_circuit_breaker
}

variable "environment" {
  description = "Environment name: dev, uat or prod."
  type        = string

  validation {
    condition     = contains(["dev", "uat", "prod"], var.environment)
    error_message = "environment must be one of: dev, uat, prod."
  }
}

variable "name_prefix" {
  description = "Prefix applied to every resource name."
  type        = string
}

variable "vpc_id" {
  description = "VPC the environment is deployed into."
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnets for the internet-facing load balancer (at least two AZs)."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "An ALB requires subnets in at least two availability zones."
  }
}

variable "private_subnet_ids" {
  description = "Subnets for the ECS tasks."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 1
    error_message = "At least one subnet is required for the ECS service."
  }
}

variable "assign_public_ip" {
  description = <<-EOT
    Give tasks a public IP so they can pull images without a NAT gateway.
    Used in DEV (where NAT is switched off to save money); UAT and PROD run
    tasks in private subnets behind NAT instead.
  EOT
  type        = bool
  default     = false
}

# --- Application -------------------------------------------------------------

variable "container_image" {
  description = "Fully qualified container image, e.g. <account>.dkr.ecr.<region>.amazonaws.com/app:sha."
  type        = string
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
  default     = 3000

  validation {
    condition     = var.container_port > 0 && var.container_port <= 65535
    error_message = "container_port must be a valid TCP port."
  }
}

variable "app_version" {
  description = "Version/build identifier surfaced by the app on /readyz; used by the smoke test."
  type        = string
  default     = "dev"
}

variable "environment_variables" {
  description = "Extra environment variables injected into the container."
  type        = map(string)
  default     = {}
}

# --- Sizing (this is what actually differs between dev/uat/prod) -------------

variable "desired_count" {
  description = "Baseline number of running tasks."
  type        = number

  validation {
    condition     = var.desired_count >= 1
    error_message = "desired_count must be at least 1."
  }
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.task_cpu)
    error_message = "task_cpu must be one of the valid Fargate values: 256, 512, 1024, 2048, 4096."
  }
}

variable "task_memory" {
  description = "Fargate task memory in MiB. Must be a legal pairing with task_cpu."
  type        = number

  validation {
    condition     = var.task_memory >= 512 && var.task_memory % 512 == 0
    error_message = "task_memory must be at least 512 MiB and a multiple of 512."
  }
}

variable "enable_autoscaling" {
  description = "Whether to attach CPU target-tracking autoscaling to the service."
  type        = bool
  default     = false
}

variable "autoscaling_min_capacity" {
  description = "Minimum task count when autoscaling is enabled."
  type        = number
  default     = 1
}

variable "autoscaling_max_capacity" {
  description = "Maximum task count when autoscaling is enabled."
  type        = number
  default     = 4
}

variable "autoscaling_cpu_target" {
  description = "Average CPU utilisation percentage the autoscaler aims to hold."
  type        = number
  default     = 60
}

# --- Health checking / rollback ---------------------------------------------

variable "health_check_path" {
  description = "Path the ALB target group polls to decide whether a task is healthy."
  type        = string
  default     = "/healthz"
}

variable "health_check_interval" {
  description = "Seconds between ALB health checks."
  type        = number
  default     = 30
}

variable "deployment_circuit_breaker" {
  description = <<-EOT
    Enable the ECS deployment circuit breaker with automatic rollback. When a
    new task set fails to reach a steady state, ECS rolls the service back to
    the last known-good task definition without operator intervention. This is
    the infrastructure half of the "rollback on failed smoke test" story; the
    pipeline half lives in .github/workflows/promote.yml.
  EOT
  type        = bool
  default     = true
}

variable "deregistration_delay" {
  description = "Seconds the target group waits for in-flight requests to drain."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the container log group."
  type        = number
  default     = 14

  validation {
    condition = contains(
      [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653],
      var.log_retention_days
    )
    error_message = "log_retention_days must be a value accepted by CloudWatch Logs."
  }
}

variable "enable_deletion_protection" {
  description = "Protect the load balancer from accidental deletion (recommended in PROD)."
  type        = bool
  default     = false
}

variable "ingress_cidr_blocks" {
  description = "CIDR blocks allowed to reach the load balancer."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}

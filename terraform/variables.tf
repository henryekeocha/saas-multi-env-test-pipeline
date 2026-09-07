variable "project" {
  description = "Project slug used to name resources."
  type        = string
  default     = "saas-demo"
}

variable "environment" {
  description = "Environment this configuration is being applied to."
  type        = string

  validation {
    condition     = contains(["dev", "uat", "prod"], var.environment)
    error_message = "environment must be one of: dev, uat, prod."
  }
}

variable "aws_region" {
  description = "AWS region for the environment."
  type        = string
  default     = "us-east-1"
}

# --- Network ----------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the environment VPC. Each environment uses a distinct range."
  type        = string
}

variable "availability_zone_count" {
  description = "Number of AZs to span."
  type        = number
  default     = 2
}

variable "enable_nat_gateway" {
  description = "Create NAT gateways for private subnet egress."
  type        = bool
  default     = false
}

variable "single_nat_gateway" {
  description = "Share a single NAT gateway across AZs instead of one per AZ."
  type        = bool
  default     = true
}

# --- Application ------------------------------------------------------------

variable "container_image" {
  description = "Container image to run. CI substitutes an immutable image digest/tag per deploy."
  type        = string
}

variable "container_port" {
  description = "Port the application listens on."
  type        = number
  default     = 3000
}

variable "app_version" {
  description = "Build identifier reported by /readyz and asserted by the smoke test."
  type        = string
  default     = "dev"
}

variable "assign_public_ip" {
  description = "Run tasks in public subnets with public IPs (DEV only, avoids NAT cost)."
  type        = bool
  default     = false
}

# --- Sizing -----------------------------------------------------------------

variable "desired_count" {
  description = "Baseline task count for the environment."
  type        = number
}

variable "task_cpu" {
  description = "Fargate CPU units per task."
  type        = number
}

variable "task_memory" {
  description = "Fargate memory (MiB) per task."
  type        = number
}

variable "enable_autoscaling" {
  description = "Attach CPU target-tracking autoscaling to the service."
  type        = bool
  default     = false
}

variable "autoscaling_min_capacity" {
  description = "Autoscaling floor."
  type        = number
  default     = 1
}

variable "autoscaling_max_capacity" {
  description = "Autoscaling ceiling."
  type        = number
  default     = 4
}

# --- Operational ------------------------------------------------------------

variable "health_check_path" {
  description = "ALB health check path."
  type        = string
  default     = "/healthz"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for container logs."
  type        = number
  default     = 14
}

variable "enable_deletion_protection" {
  description = "Protect the load balancer from accidental deletion."
  type        = bool
  default     = false
}

variable "ingress_cidr_blocks" {
  description = "CIDR blocks permitted to reach the load balancer."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "additional_tags" {
  description = "Extra tags merged into the default tag set."
  type        = map(string)
  default     = {}
}

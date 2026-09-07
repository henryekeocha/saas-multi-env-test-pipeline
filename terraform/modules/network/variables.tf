variable "name_prefix" {
  description = "Prefix applied to every resource name, e.g. \"saas-demo-dev\"."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. Must be large enough for two /24s per tier."
  type        = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "availability_zone_count" {
  description = "Number of AZs to spread subnets across. Two is the ALB minimum."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "availability_zone_count must be 2 or 3."
  }
}

variable "enable_nat_gateway" {
  description = <<-EOT
    Whether to create NAT gateways so private subnets get outbound internet
    access. Left off in DEV to keep the environment cheap; on in UAT/PROD so
    tasks can pull images and reach third-party APIs the way PROD does.
  EOT
  type        = bool
  default     = false
}

variable "single_nat_gateway" {
  description = "Share one NAT gateway across all AZs (cheaper, but not AZ-fault-tolerant)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}

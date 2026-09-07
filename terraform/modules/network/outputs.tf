output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs, one per AZ (ALB lives here)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs, one per AZ (application tasks live here)."
  value       = aws_subnet.private[*].id
}

output "availability_zones" {
  description = "AZs the subnets were placed in."
  value       = local.azs
}

output "nat_gateway_ids" {
  description = "NAT gateway IDs, empty when NAT is disabled."
  value       = aws_nat_gateway.this[*].id
}

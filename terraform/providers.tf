terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Real deployments keep state per environment in S3 with DynamoDB locking.
  # It is left commented out so this repo can be initialised offline with
  # `terraform init -backend=false` and validated without AWS credentials.
  #
  # backend "s3" {
  #   bucket         = "acme-tfstate"
  #   key            = "saas-multi-env/terraform.tfstate"  # -backend-config per env
  #   region         = "us-east-1"
  #   dynamodb_table = "acme-tfstate-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

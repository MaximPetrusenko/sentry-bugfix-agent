variable "name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "sentry-bugfix-agent"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "ecr_image_uri" {
  description = "ECR image URI for the agent container"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID to deploy into"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the ECS service"
  type        = list(string)
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach the webhook endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "sentry_token" {
  description = "Sentry auth token"
  type        = string
  sensitive   = true
}

variable "sentry_webhook_secret" {
  description = "Sentry webhook signing secret"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}

# Optional: AWS ECS Fargate Deployment

This Terraform module deploys `sentry-bugfix-agent` as an ECS Fargate service with secrets in SSM Parameter Store.

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured
- An ECR repository containing the built agent image
- An existing VPC and subnets

## Usage

```hcl
module "sentry_bugfix_agent" {
  source = "./deploy/terraform"

  ecr_image_uri         = "123456789.dkr.ecr.us-east-1.amazonaws.com/sentry-bugfix-agent:latest"
  vpc_id                = "vpc-12345678"
  subnet_ids            = ["subnet-aaa", "subnet-bbb"]
  allowed_cidr_blocks   = ["10.0.0.0/8"]  # restrict to your network

  sentry_token          = var.sentry_token
  sentry_webhook_secret = var.sentry_webhook_secret
  github_token          = var.github_token
  anthropic_api_key     = var.anthropic_api_key
}
```

Build and push the image first:

```bash
aws ecr get-login-password | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker build -t sentry-bugfix-agent .
docker tag sentry-bugfix-agent:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/sentry-bugfix-agent:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/sentry-bugfix-agent:latest
```

The config file (`bugfix-agent.config.yaml`) should be baked into the image or mounted via EFS. For simple deployments, bake it in by adding it to the Dockerfile before the `COPY --from=builder` step.

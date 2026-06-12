## Optional AWS ECS Fargate deployment for sentry-bugfix-agent
## This is a minimal reference deployment. Adjust VPC, subnets, and
## security groups to match your environment.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── SSM Parameters (secrets) ─────────────────────────────────────────────────

resource "aws_ssm_parameter" "sentry_token" {
  name  = "/${var.name}/SENTRY_TOKEN"
  type  = "SecureString"
  value = var.sentry_token
}

resource "aws_ssm_parameter" "sentry_webhook_secret" {
  name  = "/${var.name}/SENTRY_WEBHOOK_SECRET"
  type  = "SecureString"
  value = var.sentry_webhook_secret
}

resource "aws_ssm_parameter" "github_token" {
  name  = "/${var.name}/GITHUB_TOKEN"
  type  = "SecureString"
  value = var.github_token
}

resource "aws_ssm_parameter" "anthropic_api_key" {
  name  = "/${var.name}/ANTHROPIC_API_KEY"
  type  = "SecureString"
  value = var.anthropic_api_key
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ── Task Execution Role ───────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_policy" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ssm_read" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ssm:GetParameters", "ssm:GetParameter"]
      Resource = [
        aws_ssm_parameter.sentry_token.arn,
        aws_ssm_parameter.sentry_webhook_secret.arn,
        aws_ssm_parameter.github_token.arn,
        aws_ssm_parameter.anthropic_api_key.arn,
      ]
    }]
  })
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "agent" {
  name              = "/ecs/${var.name}"
  retention_in_days = 30
}

# ── ECS Task Definition ───────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "agent" {
  family                   = var.name
  cpu                      = "512"
  memory                   = "1024"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name  = "agent"
    image = "${var.ecr_image_uri}"
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "CONFIG_PATH", value = "/app/bugfix-agent.config.yaml" }
    ]

    secrets = [
      { name = "SENTRY_TOKEN", valueFrom = aws_ssm_parameter.sentry_token.arn },
      { name = "SENTRY_WEBHOOK_SECRET", valueFrom = aws_ssm_parameter.sentry_webhook_secret.arn },
      { name = "GITHUB_TOKEN", valueFrom = aws_ssm_parameter.github_token.arn },
      { name = "ANTHROPIC_API_KEY", valueFrom = aws_ssm_parameter.anthropic_api_key.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.agent.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

# ── ECS Service ───────────────────────────────────────────────────────────────

resource "aws_ecs_service" "agent" {
  name            = var.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agent.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.agent.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

# ── Security Group ────────────────────────────────────────────────────────────

resource "aws_security_group" "agent" {
  name   = "${var.name}-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

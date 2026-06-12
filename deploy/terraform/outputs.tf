output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.agent.name
}

output "log_group" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.agent.name
}

output "security_group_id" {
  description = "Security group ID for the agent service"
  value       = aws_security_group.agent.id
}

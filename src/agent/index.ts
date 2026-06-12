import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config.js';
import type { AuditLog } from '../guardrails/audit-log.js';
import type { AgentDispatcher } from './dispatcher.js';
import { createAnthropicAgent } from './anthropic-agent.js';

export type { AgentDispatcher } from './dispatcher.js';

export function createAgentDispatcher(
  client: Anthropic,
  config: Config['anthropic'],
  auditLog: AuditLog,
): AgentDispatcher {
  return createAnthropicAgent(
    client,
    { model: config.model, maxTokensPerTurn: config.maxTokensPerTurn },
    auditLog,
  );
}

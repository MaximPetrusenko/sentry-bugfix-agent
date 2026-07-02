import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Config } from '../config.js';
import type { AuditLog } from '../guardrails/audit-log.js';
import type { AgentDispatcher } from './dispatcher.js';
import { createAnthropicAgent } from './anthropic-agent.js';
import { createOpenAIAgent } from './openai-agent.js';

export type { AgentDispatcher } from './dispatcher.js';

export function createAgentDispatcher(config: Config, auditLog: AuditLog): AgentDispatcher {
  if (config.agentProvider === 'openai') {
    if (!config.openai) throw new Error('openai config is required when agentProvider is "openai"');
    const client = new OpenAI({ apiKey: config.openai.apiKey });
    return createOpenAIAgent(
      client,
      { model: config.openai.model, maxTokensPerTurn: config.openai.maxTokensPerTurn },
      auditLog,
    );
  }

  if (!config.anthropic) throw new Error('anthropic config is required when agentProvider is "anthropic"');
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return createAnthropicAgent(
    client,
    { model: config.anthropic.model, maxTokensPerTurn: config.anthropic.maxTokensPerTurn },
    auditLog,
  );
}

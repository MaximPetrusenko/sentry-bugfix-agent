import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import type { IssueContext, AgentResult } from '../types.js';
import type { AuditLog } from '../guardrails/audit-log.js';
import type { AgentDispatcher } from './dispatcher.js';
import { SYSTEM_PROMPT } from './prompts/system.js';
import { buildFixRequestPrompt } from './prompts/fix-request.js';

export interface OpenAIAgentConfig {
  model: string;
  maxTokensPerTurn: number;
}

export function createOpenAIAgent(
  client: OpenAI,
  config: OpenAIAgentConfig,
  auditLog: AuditLog,
): AgentDispatcher {
  return {
    async dispatch(context: IssueContext): Promise<AgentResult> {
      const auditId = randomUUID();
      const issueId = context.triageResult.issueId;
      const userPrompt = buildFixRequestPrompt(context);

      await auditLog.append({
        issueId,
        phase: 'agent',
        action: 'agent_started',
        detail: { auditId, model: config.model, provider: 'openai', promptLength: userPrompt.length },
      });

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      let fullResponse = '';
      let turnCount = 0;
      const maxTurns = 5;

      try {
        while (turnCount < maxTurns) {
          turnCount++;

          const response = await client.chat.completions.create({
            model: config.model,
            max_tokens: config.maxTokensPerTurn,
            messages,
          });

          const choice = response.choices[0];
          const text = choice?.message.content ?? '';
          fullResponse += text;

          await auditLog.append({
            issueId,
            phase: 'agent',
            action: 'agent_turn',
            detail: {
              auditId,
              turn: turnCount,
              stopReason: choice?.finish_reason ?? null,
              inputTokens: response.usage?.prompt_tokens ?? 0,
              outputTokens: response.usage?.completion_tokens ?? 0,
            },
          });

          if (choice?.finish_reason === 'stop') break;

          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: 'Continue with your fix. If you are done, say so explicitly.',
          });
        }

        // Reuse the same response parser as the Anthropic agent
        const { parseAgentResponse } = await import('./anthropic-agent.js');
        const parsed = parseAgentResponse(fullResponse);

        await auditLog.append({
          issueId,
          phase: 'agent',
          action: 'agent_completed',
          detail: { auditId, success: parsed.success, diffLength: parsed.diff.length, testAdded: parsed.testAdded },
        });

        return { ...parsed, auditLogId: auditId };
      } catch (err) {
        await auditLog.append({
          issueId,
          phase: 'agent',
          action: 'agent_failed',
          detail: { auditId, error: String(err) },
        });

        return {
          success: false,
          diff: '',
          explanation: '',
          testAdded: false,
          auditLogId: auditId,
          error: String(err),
        };
      }
    },
  };
}

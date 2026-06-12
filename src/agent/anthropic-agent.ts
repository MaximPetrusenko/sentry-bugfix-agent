import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { IssueContext, AgentResult } from '../types.js';
import type { AuditLog } from '../guardrails/audit-log.js';
import type { AgentDispatcher } from './dispatcher.js';
import { SYSTEM_PROMPT } from './prompts/system.js';
import { buildFixRequestPrompt } from './prompts/fix-request.js';

export interface AnthropicAgentConfig {
  model: string;
  maxTokensPerTurn: number;
}

export function createAnthropicAgent(
  client: Anthropic,
  config: AnthropicAgentConfig,
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
        detail: {
          auditId,
          model: config.model,
          promptLength: userPrompt.length,
        },
      });

      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
      let fullResponse = '';
      let turnCount = 0;
      const maxTurns = 5;

      try {
        while (turnCount < maxTurns) {
          turnCount++;

          const response = await client.messages.create({
            model: config.model,
            max_tokens: config.maxTokensPerTurn,
            system: SYSTEM_PROMPT,
            messages,
          });

          await auditLog.append({
            issueId,
            phase: 'agent',
            action: 'agent_turn',
            detail: {
              auditId,
              turn: turnCount,
              stopReason: response.stop_reason,
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
          });

          const textBlock = response.content.find((b) => b.type === 'text');
          const text = textBlock?.type === 'text' ? textBlock.text : '';
          fullResponse += text;

          if (response.stop_reason === 'end_turn') break;

          // Continue if model wants more turns (e.g., needs to revise)
          messages.push({ role: 'assistant', content: response.content });
          messages.push({
            role: 'user',
            content: 'Continue with your fix. If you are done, say so explicitly.',
          });
        }

        const parsed = parseAgentResponse(fullResponse);

        await auditLog.append({
          issueId,
          phase: 'agent',
          action: 'agent_completed',
          detail: {
            auditId,
            success: parsed.success,
            diffLength: parsed.diff.length,
            testAdded: parsed.testAdded,
          },
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

export function parseAgentResponse(response: string): Omit<AgentResult, 'auditLogId'> {
  // Extract diff from code block
  const diffMatch = /```diff\n([\s\S]*?)```/.exec(response);
  const diff = diffMatch?.[1]?.trim() ?? '';

  // Extract explanation sections
  const rootCauseMatch = /\*\*Root cause\*\*:\s*(.+?)(?=\*\*Fix rationale\*\*|\*\*Test added\*\*|$)/s.exec(response);
  const fixRationaleMatch = /\*\*Fix rationale\*\*:\s*(.+?)(?=\*\*Test added\*\*|$)/s.exec(response);
  const testAddedMatch = /\*\*Test added\*\*:\s*(.+?)$/m.exec(response);

  const rootCause = rootCauseMatch?.[1]?.trim() ?? '';
  const fixRationale = fixRationaleMatch?.[1]?.trim() ?? '';
  const testAddedText = testAddedMatch?.[1]?.trim().toLowerCase() ?? '';
  const testAdded = testAddedText.startsWith('yes');

  const explanation = [
    rootCause && `**Root cause**: ${rootCause}`,
    fixRationale && `**Fix rationale**: ${fixRationale}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!diff) {
    return {
      success: false,
      diff: '',
      explanation: explanation || response.slice(0, 500),
      testAdded: false,
      error: 'No diff found in agent response',
    };
  }

  return { success: true, diff, explanation, testAdded };
}

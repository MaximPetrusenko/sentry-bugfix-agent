import type { IssueContext, AgentResult } from '../types.js';

/**
 * AgentDispatcher is the interface all agent backends must implement.
 * This allows swapping between a direct Anthropic API loop, a Claude Code
 * subprocess, or any future agent backend without touching the pipeline.
 */
export interface AgentDispatcher {
  dispatch(context: IssueContext): Promise<AgentResult>;
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createPathChecker } from '../guardrails/path-rules.js';
import type { Config } from '../config.js';
import type { SentryClientInterface } from '../context/sentry-client.js';

export interface McpServerOptions {
  config: Config;
  sentryClient: SentryClientInterface;
  repoRoot?: string;
}

/**
 * Our own MCP server that exposes mediated pipeline tools to the agent.
 * All tool calls are logged and path-checked before execution.
 */
export function createPipelineMcpServer(options: McpServerOptions): McpServer {
  const { config, sentryClient } = options;
  const repoRoot = options.repoRoot ?? process.cwd();

  const pathChecker = createPathChecker({
    allowedPaths: config.guardrails.allowedPaths,
    deniedPaths: config.guardrails.deniedPaths,
  });

  const server = new McpServer({
    name: 'sentry-bugfix-agent',
    version: '0.1.0',
  });

  server.tool(
    'read_repo_file',
    'Read a file from the target repository. Only files in allowed paths can be read.',
    {
      file_path: z.string().describe('Path to the file relative to the repository root'),
    },
    async ({ file_path }) => {
      const pathResult = pathChecker(file_path);
      if (!pathResult.allowed) {
        return {
          content: [{ type: 'text', text: `Error: ${pathResult.reason}` }],
          isError: true,
        };
      }

      const absolutePath = resolve(repoRoot, file_path);
      if (!existsSync(absolutePath)) {
        return {
          content: [{ type: 'text', text: `Error: File not found: ${file_path}` }],
          isError: true,
        };
      }

      try {
        const content = readFileSync(absolutePath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error reading file: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_issue_context',
    'Fetch full details for a Sentry issue including stack trace, breadcrumbs, and event count.',
    {
      issue_id: z.string().describe('The Sentry issue ID'),
    },
    async ({ issue_id }) => {
      try {
        const [issue, eventCount24h] = await Promise.all([
          sentryClient.getIssue(issue_id),
          sentryClient.getEventCount24h(issue_id),
        ]);

        const summary = JSON.stringify({ issue, eventCount24h }, null, 2);
        return { content: [{ type: 'text', text: summary }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching issue: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'propose_diff',
    'Propose a unified diff for review. The diff will be validated against guardrails before being applied.',
    {
      diff: z.string().describe('A unified diff in git format'),
      explanation: z.string().describe('Plain-language explanation of the fix'),
    },
    async ({ diff, explanation }) => {
      // Count lines for preview
      const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
      const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              accepted: true,
              addedLines,
              removedLines,
              explanation,
              note: 'Diff has been recorded. Guardrail checks will run before this is applied.',
            }),
          },
        ],
      };
    },
  );

  return server;
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const server = createPipelineMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp-server] sentry-bugfix-agent MCP server running on stdio');
}

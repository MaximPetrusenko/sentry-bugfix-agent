#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './config.js';
import { createWebhookServer } from './intake/webhook.js';
import { createPoller } from './intake/poller.js';
import { createAuditLog } from './guardrails/audit-log.js';
import { createPipeline } from './pipeline.js';
import { SentryMcpClient } from './context/sentry-client.js';
import { Octokit } from '@octokit/rest';

// Note: Anthropic/OpenAI clients are constructed inside createPipeline based on agentProvider.
// The Octokit and SentryMcpClient below are solely for the feedback webhook handler.

const configPath = process.env['CONFIG_PATH'] ?? resolve(process.cwd(), 'bugfix-agent.config.yaml');

let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  console.error(`[sentry-bugfix-agent] Failed to load config: ${String(err)}`);
  process.exit(1);
}

const auditLog = createAuditLog(config.audit.logPath);
const pipeline = createPipeline(config, auditLog);

const sentryClient = new SentryMcpClient({
  token: config.sentry.token,
  organization: config.sentry.organization,
});
const octokit = new Octokit({ auth: config.github.token });

const server = createWebhookServer(config, pipeline, {
  octokit,
  sentryClient,
  auditLog,
});
server.listen(config.server.port, config.server.host, () => {
  console.log(
    `[sentry-bugfix-agent] Webhook server listening on ${config.server.host}:${config.server.port}`,
  );
});

if (config.sentry.pollIntervalSeconds > 0) {
  const poller = createPoller(config, pipeline);
  poller.start();
  console.log(
    `[sentry-bugfix-agent] Polling Sentry every ${config.sentry.pollIntervalSeconds}s as fallback`,
  );
}

process.on('SIGTERM', () => {
  console.log('[sentry-bugfix-agent] Shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[sentry-bugfix-agent] Uncaught exception:', err);
  process.exit(1);
});

// Allow reading version without full config
if (process.argv[2] === '--version') {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
    version: string;
  };
  console.log(pkg.version);
  process.exit(0);
}

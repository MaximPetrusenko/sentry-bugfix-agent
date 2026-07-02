import type { Config } from './config.js';
import type { SentryEvent, TriageResult } from './types.js';
import type { AuditLog } from './guardrails/audit-log.js';
import { resolveRepo } from './config.js';
import { createTriageEngine } from './triage/index.js';
import { createContextAssembler } from './context/index.js';
import { createGuardrails } from './guardrails/index.js';
import { createAgentDispatcher } from './agent/index.js';
import { createDelivery } from './delivery/index.js';
import { SentryMcpClient } from './context/sentry-client.js';
import { Octokit } from '@octokit/rest';

export interface Pipeline {
  processEvent(event: SentryEvent): Promise<void>;
}

export function createPipeline(config: Config, auditLog: AuditLog): Pipeline {
  const sentryClient = new SentryMcpClient({
    token: config.sentry.token,
    organization: config.sentry.organization,
  });

  const octokit = new Octokit({ auth: config.github.token });

  const triage = createTriageEngine(
    config.triage,
    config.sentry.environments,
    config.sentry.projects,
    config.sentry.blockedProjects,
  );
  const guardrails = createGuardrails(config.guardrails, auditLog);
  const dispatcher = createAgentDispatcher(config, auditLog);

  return {
    async processEvent(event: SentryEvent): Promise<void> {
      const issueId = event.issueId;

      await auditLog.append({
        issueId,
        phase: 'intake',
        action: 'event_received',
        detail: { eventId: event.id, environment: event.environment, errorType: event.errorType, project: event.projectSlug },
      });

      // Triage
      let triageResult: TriageResult;
      try {
        triageResult = await triage.evaluate(event);
      } catch (err) {
        await auditLog.append({
          issueId,
          phase: 'triage',
          action: 'triage_error',
          detail: { error: String(err) },
        });
        return;
      }

      await auditLog.append({
        issueId,
        phase: 'triage',
        action: 'triage_complete',
        detail: {
          severity: triageResult.severity,
          shouldAutoFix: triageResult.shouldAutoFix,
          reason: triageResult.reason,
        },
      });

      if (!triageResult.shouldAutoFix) {
        console.log(
          `[pipeline] Issue ${issueId} skipped: ${triageResult.reason} (severity=${triageResult.severity})`,
        );
        return;
      }

      // Resolve the target GitHub repo for this Sentry project
      const repoConfig = resolveRepo(config, event.projectSlug);
      if (!repoConfig) {
        await auditLog.append({
          issueId,
          phase: 'triage',
          action: 'no_repo_mapping',
          detail: { projectSlug: event.projectSlug },
        });
        console.warn(`[pipeline] No GitHub repo mapped for Sentry project "${event.projectSlug}", skipping`);
        return;
      }

      // Check rate limits before doing expensive work
      const rateLimitOk = await guardrails.checkRateLimit(issueId);
      if (!rateLimitOk) {
        await auditLog.append({
          issueId,
          phase: 'guardrail_check',
          action: 'rate_limit_exceeded',
          detail: {},
        });
        console.warn(`[pipeline] Rate limit exceeded, skipping issue ${issueId}`);
        return;
      }

      // Context assembly — scoped to the resolved repo
      const context = createContextAssembler(sentryClient, repoConfig);
      let issueContext;
      try {
        issueContext = await context.assemble(triageResult);
      } catch (err) {
        await auditLog.append({
          issueId,
          phase: 'context',
          action: 'context_error',
          detail: { error: String(err) },
        });
        console.error(`[pipeline] Context assembly failed for ${issueId}:`, err);
        return;
      }

      // Agent dispatch
      let agentResult;
      try {
        agentResult = await dispatcher.dispatch(issueContext);
      } catch (err) {
        await auditLog.append({
          issueId,
          phase: 'agent',
          action: 'agent_error',
          detail: { error: String(err) },
        });
        console.error(`[pipeline] Agent dispatch failed for ${issueId}:`, err);
        return;
      }

      if (!agentResult.success || !agentResult.diff) {
        await auditLog.append({
          issueId,
          phase: 'agent',
          action: 'agent_no_fix',
          detail: { error: agentResult.error },
        });
        console.warn(`[pipeline] Agent could not produce a fix for ${issueId}: ${agentResult.error}`);
        return;
      }

      // Guardrail validation of the produced diff
      const guardrailResult = await guardrails.validate(agentResult.diff, issueId);
      if (!guardrailResult.passed) {
        await auditLog.append({
          issueId,
          phase: 'guardrail_check',
          action: 'guardrail_failed',
          detail: { reason: guardrailResult.reason },
        });
        console.warn(`[pipeline] Guardrail blocked fix for ${issueId}: ${guardrailResult.reason}`);
        return;
      }

      // Delivery — use the resolved repo config
      const delivery = createDelivery(octokit, repoConfig);
      try {
        const pr = await delivery.deliver({ issueContext, agentResult, triageResult });
        await auditLog.append({
          issueId,
          phase: 'delivery',
          action: 'pr_opened',
          detail: { prUrl: pr.url, prNumber: pr.number, branch: pr.branch, repo: repoConfig.repo },
        });
        console.log(`[pipeline] PR opened for ${issueId}: ${pr.url}`);
      } catch (err) {
        await auditLog.append({
          issueId,
          phase: 'delivery',
          action: 'delivery_error',
          detail: { error: String(err) },
        });
        console.error(`[pipeline] Delivery failed for ${issueId}:`, err);
      }
    },
  };
}

import type { Octokit } from '@octokit/rest';
import express, { type Request, type Response } from 'express';
import type { SentryClientInterface } from '../context/sentry-client.js';
import type { AuditLog } from '../guardrails/audit-log.js';

export interface FeedbackHandlerOptions {
  octokit: Octokit;
  sentryClient: SentryClientInterface;
  auditLog: AuditLog;
  owner: string;
  repo: string;
  autoResolveOnMerge: boolean;
}

/**
 * Register GitHub webhook handler routes for PR merge/close events.
 * Mount this on the same express app as the Sentry webhook.
 */
export function registerFeedbackRoutes(
  app: express.Express,
  options: FeedbackHandlerOptions,
): void {
  app.post('/webhook/github', (req: Request, res: Response) => {
    const event = req.headers['x-github-event'];
    if (event !== 'pull_request') {
      res.status(200).json({ received: true, processed: false });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payload = req.body;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const action: string = payload?.action ?? '';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const pr = payload?.pull_request;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const labels: string[] = (pr?.labels ?? []).map((l: { name: string }) => l.name);

    if (!labels.includes('agent-fix')) {
      res.status(200).json({ received: true, processed: false, reason: 'not an agent-fix PR' });
      return;
    }

    void handlePrEvent(action, pr, options).catch((err) => {
      console.error('[feedback] Error handling PR event:', err);
    });

    res.status(200).json({ received: true, processed: true });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePrEvent(action: string, pr: any, options: FeedbackHandlerOptions): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const branchName: string = pr?.head?.ref ?? '';
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const prNumber: number = pr?.number ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const prUrl: string = pr?.html_url ?? '';

  // Extract Sentry issue ID from branch name (fix/<issueId>-<slug>)
  const issueIdMatch = /^fix\/([^-]+)-/.exec(branchName);
  const sentryIssueId = issueIdMatch?.[1];

  if (!sentryIssueId) return;

  if (action === 'closed') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const merged: boolean = pr?.merged ?? false;

    if (merged) {
      await options.auditLog.append({
        issueId: sentryIssueId,
        phase: 'feedback',
        action: 'pr_merged',
        detail: { prNumber, prUrl, autoResolve: options.autoResolveOnMerge },
      });

      if (options.autoResolveOnMerge) {
        try {
          await options.sentryClient.resolveIssue(
            sentryIssueId,
            `Resolved by agent-generated fix. PR: ${prUrl}`,
          );
          console.log(`[feedback] Resolved Sentry issue ${sentryIssueId} after PR ${prNumber} merged`);
        } catch (err) {
          console.error(`[feedback] Failed to resolve Sentry issue ${sentryIssueId}:`, err);
        }
      } else {
        console.log(
          `[feedback] PR ${prNumber} merged for issue ${sentryIssueId} — autoResolveOnMerge is off, resolve manually in Sentry`,
        );
      }
    } else {
      // PR closed without merging — mark for manual handling
      await options.auditLog.append({
        issueId: sentryIssueId,
        phase: 'feedback',
        action: 'pr_rejected',
        detail: { prNumber, prUrl },
      });
      console.log(
        `[feedback] PR ${prNumber} closed unmerged for issue ${sentryIssueId} — flagged for manual handling`,
      );
    }
  }
}

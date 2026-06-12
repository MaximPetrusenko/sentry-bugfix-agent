import type { SentryEvent, SentryIssue, TriageResult } from '../types.js';
import type { Config } from '../config.js';
import { createInMemoryDedupStore, type DedupStore } from './dedup.js';
import { classifySeverity } from './severity.js';

export interface TriageEngine {
  evaluate(event: SentryEvent, eventCount24h?: number): Promise<TriageResult>;
}

export function createTriageEngine(
  config: Config['triage'],
  allowedEnvironments: string[],
  dedupStore: DedupStore = createInMemoryDedupStore(),
): TriageEngine {
  return {
    async evaluate(event: SentryEvent, eventCount24h = 0): Promise<TriageResult> {
      const stub: SentryIssue = {
        id: event.issueId,
        title: event.message,
        culprit: event.culprit,
        permalink: '',
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        count: String(eventCount24h),
        userCount: 0,
        status: 'unresolved',
        level: event.errorType,
        platform: 'node',
        tags: [],
        project: { slug: event.projectSlug },
      };

      // Environment filter
      if (!allowedEnvironments.includes(event.environment)) {
        return {
          issueId: event.issueId,
          severity: 'minor',
          shouldAutoFix: false,
          reason: `Environment "${event.environment}" is not in the allowed list`,
          event,
          issue: stub,
        };
      }

      // Dedup
      if (dedupStore.hasProcessed(event.issueId)) {
        return {
          issueId: event.issueId,
          severity: 'minor',
          shouldAutoFix: false,
          reason: 'Issue already processed in this session',
          event,
          issue: stub,
        };
      }

      const severityResult = classifySeverity(event, eventCount24h, config.severity);
      dedupStore.markProcessed(event.issueId);

      if (severityResult.severity === 'security') {
        return {
          issueId: event.issueId,
          severity: 'security',
          shouldAutoFix: false,
          reason: `Security issue — filed for human review: ${severityResult.reason}`,
          event,
          issue: stub,
        };
      }

      return {
        issueId: event.issueId,
        severity: severityResult.severity,
        shouldAutoFix: true,
        reason: severityResult.reason,
        event,
        issue: stub,
      };
    },
  };
}

import type { Config } from '../config.js';
import type { AuditLog } from './audit-log.js';
import { createPathChecker, extractPathsFromDiff } from './path-rules.js';
import { checkDiffSize, diffIntroducesNewDependency } from './diff-limits.js';
import { createRateLimiter } from './rate-limiter.js';

export interface GuardrailResult {
  passed: boolean;
  reason: string;
}

export interface Guardrails {
  checkRateLimit(issueId: string): Promise<boolean>;
  validate(diff: string, issueId: string): Promise<GuardrailResult>;
}

export function createGuardrails(config: Config['guardrails'], auditLog: AuditLog): Guardrails {
  const pathChecker = createPathChecker({
    allowedPaths: config.allowedPaths,
    deniedPaths: config.deniedPaths,
  });

  const rateLimiter = createRateLimiter({
    maxPerHour: config.maxAgentRunsPerHour,
    maxPerDay: config.maxAgentRunsPerDay,
  });

  return {
    async checkRateLimit(issueId: string): Promise<boolean> {
      const allowed = rateLimiter.checkAndConsume();
      if (!allowed) {
        const stats = rateLimiter.getStats();
        await auditLog.append({
          issueId,
          phase: 'guardrail_check',
          action: 'rate_limit_exceeded',
          detail: { hourCount: stats.hourCount, dayCount: stats.dayCount },
        });
      }
      return allowed;
    },

    async validate(diff: string, issueId: string): Promise<GuardrailResult> {
      // 1. Check for new dependencies
      if (diffIntroducesNewDependency(diff)) {
        await auditLog.append({
          issueId,
          phase: 'guardrail_check',
          action: 'new_dependency_detected',
          detail: {},
        });
        return {
          passed: false,
          reason: 'Diff modifies a dependency manifest — new dependencies are not allowed',
        };
      }

      // 2. Check diff size
      const diffCheck = checkDiffSize(diff, config.maxDiffLines);
      if (!diffCheck.withinLimit) {
        await auditLog.append({
          issueId,
          phase: 'guardrail_check',
          action: 'diff_too_large',
          detail: { changedLines: diffCheck.changedLines, limit: diffCheck.limit },
        });
        return { passed: false, reason: diffCheck.reason };
      }

      // 3. Check all modified files against path rules
      const paths = extractPathsFromDiff(diff);
      for (const filePath of paths) {
        const pathResult = pathChecker(filePath);
        if (!pathResult.allowed) {
          await auditLog.append({
            issueId,
            phase: 'guardrail_check',
            action: 'path_denied',
            detail: { filePath, reason: pathResult.reason },
          });
          return { passed: false, reason: pathResult.reason };
        }
      }

      await auditLog.append({
        issueId,
        phase: 'guardrail_check',
        action: 'guardrail_passed',
        detail: {
          changedLines: diffCheck.changedLines,
          filesChecked: paths.length,
        },
      });

      return { passed: true, reason: 'All guardrails passed' };
    },
  };
}

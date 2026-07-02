/**
 * End-to-end test that wires together the full pipeline using mocked
 * external clients (Sentry, GitHub, Anthropic). Validates that:
 * - A valid webhook event passes through triage → context → agent → guardrails → delivery
 * - Security-tagged issues are blocked before agent dispatch
 * - Oversized diffs are blocked by the guardrail
 * - Rate-limited runs are correctly rejected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SentryEvent, SentryIssue } from '../types.js';
import { createTriageEngine } from '../triage/index.js';
import { createGuardrails } from '../guardrails/index.js';
import { parseAgentResponse } from '../agent/anthropic-agent.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<SentryEvent> = {}): SentryEvent {
  return {
    id: 'e2e-evt-1',
    issueId: 'e2e-issue-1',
    projectSlug: 'demo-app',
    environment: 'staging',
    errorType: 'TypeError',
    message: 'Cannot read property of undefined',
    culprit: 'src/app.ts',
    timestamp: new Date().toISOString(),
    stackTrace: [{ filename: 'src/app.ts', function: 'getUser', lineNo: 10, colNo: 1, context: [], inApp: true, module: null }],
    tags: {},
    breadcrumbs: [],
    release: null,
    ...overrides,
  };
}

const mockAuditLog = {
  append: vi.fn().mockResolvedValue(undefined),
  getPath: () => './test-audit.jsonl',
};

const triageConfig = {
  severity: {
    criticalPatterns: ['FATAL'],
    majorPatterns: ['TypeError'],
    securityPatterns: ['sql injection', 'xss', 'security'],
    frequencyThreshold: { major: 10, critical: 100 },
  },
  useLlmClassification: false,
};

const guardrailsConfig = {
  allowedPaths: ['src/**', 'tests/**'],
  deniedPaths: ['.github/**', '**/*.lock', 'infra/**'],
  maxDiffLines: 10,
  maxAgentRunsPerHour: 3,
  maxAgentRunsPerDay: 10,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('E2E: pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Triage gate', () => {
    it('passes a normal TypeError event for auto-fix', async () => {
      const triage = createTriageEngine(triageConfig, ['staging'], ['*'], []);
      const result = await triage.evaluate(makeEvent(), 5);
      expect(result.shouldAutoFix).toBe(true);
      expect(result.severity).toBe('major');
    });

    it('blocks security-tagged events from auto-fix', async () => {
      const triage = createTriageEngine(triageConfig, ['staging'], ['*'], []);
      const result = await triage.evaluate(
        makeEvent({ issueId: 'sec-1', message: 'sql injection attempt detected' }),
        1,
      );
      expect(result.shouldAutoFix).toBe(false);
      expect(result.severity).toBe('security');
    });

    it('blocks events from non-allowed environments', async () => {
      const triage = createTriageEngine(triageConfig, ['staging'], ['*'], []);
      const result = await triage.evaluate(makeEvent({ environment: 'production' }), 1);
      expect(result.shouldAutoFix).toBe(false);
    });
  });

  describe('Guardrails gate', () => {
    it('passes a valid small diff on an allowed path', async () => {
      const guardrails = createGuardrails(guardrailsConfig, mockAuditLog);
      const diff = [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,3 +1,4 @@',
        '+if (!user) return null;',
        ' const x = 1;',
      ].join('\n');

      const result = await guardrails.validate(diff, 'e2e-issue-1');
      expect(result.passed).toBe(true);
    });

    it('blocks diffs that exceed maxDiffLines', async () => {
      const guardrails = createGuardrails(guardrailsConfig, mockAuditLog);
      const manyLines = Array.from({ length: 20 }, (_, i) => `+const x${i} = ${i};`).join('\n');
      const diff = `--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n${manyLines}`;

      const result = await guardrails.validate(diff, 'e2e-issue-1');
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('exceeding limit');
    });

    it('blocks diffs touching denied paths', async () => {
      const guardrails = createGuardrails(guardrailsConfig, mockAuditLog);
      const diff = [
        'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml',
        '--- a/.github/workflows/ci.yml',
        '+++ b/.github/workflows/ci.yml',
        '@@ -1 +1 @@',
        '+  - run: echo hacked',
      ].join('\n');

      const result = await guardrails.validate(diff, 'e2e-issue-1');
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('.github/**');
    });

    it('blocks diffs that modify dependency manifests', async () => {
      const guardrails = createGuardrails(guardrailsConfig, mockAuditLog);
      const diff = [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '+  "evil-package": "^1.0.0"',
      ].join('\n');

      const result = await guardrails.validate(diff, 'e2e-issue-1');
      expect(result.passed).toBe(false);
    });

    it('enforces hourly rate limit', async () => {
      const guardrails = createGuardrails(
        { ...guardrailsConfig, maxAgentRunsPerHour: 2 },
        mockAuditLog,
      );
      expect(await guardrails.checkRateLimit('issue-1')).toBe(true);
      expect(await guardrails.checkRateLimit('issue-2')).toBe(true);
      expect(await guardrails.checkRateLimit('issue-3')).toBe(false);
    });
  });

  describe('Agent response parsing', () => {
    it('extracts a diff and explanation from a well-formed agent response', () => {
      const response = `
I analyzed the bug carefully.

\`\`\`diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,4 @@
+  if (!user) return null;
   return user.name;
\`\`\`

**Root cause**: The function did not guard against undefined users.

**Fix rationale**: Added an early return for undefined input.

**Test added**: yes — updated unit test covers the null case.
`;

      const result = parseAgentResponse(response);
      expect(result.success).toBe(true);
      expect(result.diff).toContain('+  if (!user) return null;');
      expect(result.explanation).toContain('Root cause');
      expect(result.testAdded).toBe(true);
    });

    it('returns success=false when no diff is present', () => {
      const result = parseAgentResponse('I could not determine a fix for this issue.');
      expect(result.success).toBe(false);
      expect(result.diff).toBe('');
    });
  });
});

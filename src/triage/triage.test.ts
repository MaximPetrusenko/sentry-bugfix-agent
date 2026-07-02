import { describe, it, expect } from 'vitest';
import { createTriageEngine } from './index.js';
import type { SentryEvent } from '../types.js';

const baseTriageConfig = {
  severity: {
    criticalPatterns: ['FATAL'],
    majorPatterns: ['TypeError'],
    securityPatterns: ['sql injection', 'xss'],
    frequencyThreshold: { major: 10, critical: 100 },
  },
  useLlmClassification: false,
};

function makeEvent(overrides: Partial<SentryEvent> = {}): SentryEvent {
  return {
    id: 'evt-1',
    issueId: 'issue-1',
    projectSlug: 'my-project',
    environment: 'staging',
    errorType: 'Error',
    message: 'Something went wrong',
    culprit: 'src/app.ts',
    timestamp: '2024-01-01T00:00:00Z',
    stackTrace: [],
    tags: {},
    breadcrumbs: [],
    release: null,
    ...overrides,
  };
}

describe('createTriageEngine', () => {
  it('approves a minor event in an allowed environment', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    const result = await engine.evaluate(makeEvent(), 1);
    expect(result.shouldAutoFix).toBe(true);
    expect(result.severity).toBe('minor');
  });

  it('rejects an event from a non-allowed environment', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    const result = await engine.evaluate(makeEvent({ environment: 'production' }), 1);
    expect(result.shouldAutoFix).toBe(false);
    expect(result.reason).toContain('production');
  });

  it('rejects a duplicate issue', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    await engine.evaluate(makeEvent(), 1);
    const result = await engine.evaluate(makeEvent(), 1);
    expect(result.shouldAutoFix).toBe(false);
    expect(result.reason).toContain('already processed');
  });

  it('does not deduplicate different issue IDs', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    await engine.evaluate(makeEvent({ issueId: 'issue-1' }), 1);
    const result = await engine.evaluate(makeEvent({ issueId: 'issue-2' }), 1);
    expect(result.shouldAutoFix).toBe(true);
  });

  it('refuses to auto-fix security issues', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    const result = await engine.evaluate(
      makeEvent({ message: 'sql injection in search param' }),
      1,
    );
    expect(result.shouldAutoFix).toBe(false);
    expect(result.severity).toBe('security');
    expect(result.reason).toContain('human review');
  });

  it('marks critical issues as auto-fixable', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    const result = await engine.evaluate(makeEvent({ message: 'FATAL error in boot' }), 1);
    expect(result.shouldAutoFix).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('handles multiple environments', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging', 'development'], ['*'], []);
    const stagingResult = await engine.evaluate(makeEvent({ environment: 'staging' }), 1);
    const devResult = await engine.evaluate(
      makeEvent({ issueId: 'issue-2', environment: 'development' }),
      1,
    );
    expect(stagingResult.shouldAutoFix).toBe(true);
    expect(devResult.shouldAutoFix).toBe(true);
  });

  it('blocks events from a blocked project', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], ['tf-aws-infrastructure']);
    const result = await engine.evaluate(
      makeEvent({ projectSlug: 'tf-aws-infrastructure' }),
      1,
    );
    expect(result.shouldAutoFix).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('blocks events from projects not in the allowlist', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['api-core'], []);
    const result = await engine.evaluate(
      makeEvent({ projectSlug: 'some-other-project' }),
      1,
    );
    expect(result.shouldAutoFix).toBe(false);
    expect(result.reason).toContain('not in the allowed projects');
  });

  it('allows events when allowlist is wildcard', async () => {
    const engine = createTriageEngine(baseTriageConfig, ['staging'], ['*'], []);
    const result = await engine.evaluate(makeEvent({ projectSlug: 'any-project' }), 1);
    expect(result.shouldAutoFix).toBe(true);
  });
});

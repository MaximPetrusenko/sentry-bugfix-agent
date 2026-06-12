import { describe, it, expect } from 'vitest';
import { classifySeverity } from './severity.js';
import type { SentryEvent } from '../types.js';

const baseConfig = {
  criticalPatterns: ['OutOfMemory', 'FATAL'],
  majorPatterns: ['TypeError', 'NullPointer'],
  securityPatterns: ['security', 'sql injection', 'xss'],
  frequencyThreshold: { major: 10, critical: 100 },
};

function makeEvent(overrides: Partial<SentryEvent> = {}): SentryEvent {
  return {
    id: 'evt-1',
    issueId: 'issue-1',
    projectSlug: 'my-project',
    environment: 'staging',
    errorType: 'Error',
    message: 'Something went wrong',
    culprit: 'app/index.js',
    timestamp: '2024-01-01T00:00:00Z',
    stackTrace: [],
    tags: {},
    breadcrumbs: [],
    release: null,
    ...overrides,
  };
}

describe('classifySeverity', () => {
  it('returns minor for a generic error with low frequency', () => {
    const result = classifySeverity(makeEvent(), 1, baseConfig);
    expect(result.severity).toBe('minor');
  });

  it('classifies as major when frequency exceeds major threshold', () => {
    const result = classifySeverity(makeEvent(), 15, baseConfig);
    expect(result.severity).toBe('major');
    expect(result.reason).toContain('15');
  });

  it('classifies as critical when frequency exceeds critical threshold', () => {
    const result = classifySeverity(makeEvent(), 150, baseConfig);
    expect(result.severity).toBe('critical');
    expect(result.reason).toContain('150');
  });

  it('critical frequency threshold takes precedence over major threshold', () => {
    const result = classifySeverity(makeEvent(), 200, baseConfig);
    expect(result.severity).toBe('critical');
  });

  it('classifies as critical when error type matches criticalPatterns', () => {
    const result = classifySeverity(makeEvent({ errorType: 'OutOfMemoryError' }), 1, baseConfig);
    expect(result.severity).toBe('critical');
    expect(result.reason).toContain('OutOfMemory');
  });

  it('classifies as major when message matches majorPatterns', () => {
    const result = classifySeverity(
      makeEvent({ message: 'TypeError: cannot read property' }),
      1,
      baseConfig,
    );
    expect(result.severity).toBe('major');
  });

  it('classifies as security when message matches securityPatterns', () => {
    const result = classifySeverity(
      makeEvent({ message: 'potential sql injection detected' }),
      1,
      baseConfig,
    );
    expect(result.severity).toBe('security');
  });

  it('security classification takes precedence over frequency-based critical', () => {
    const result = classifySeverity(
      makeEvent({ message: 'xss vulnerability found' }),
      500,
      baseConfig,
    );
    expect(result.severity).toBe('security');
  });

  it('matches security pattern in tags', () => {
    const result = classifySeverity(
      makeEvent({ tags: { category: 'security' } }),
      1,
      baseConfig,
    );
    expect(result.severity).toBe('security');
  });

  it('handles invalid regex in patterns gracefully (falls back to substring)', () => {
    const configWithBadRegex = {
      ...baseConfig,
      criticalPatterns: ['[invalid regex'],
    };
    const result = classifySeverity(
      makeEvent({ message: 'everything is fine' }),
      1,
      configWithBadRegex,
    );
    expect(result.severity).toBe('minor');
  });

  it('pattern matching is case-insensitive', () => {
    const result = classifySeverity(
      makeEvent({ errorType: 'OUTOFMEMORY' }),
      1,
      baseConfig,
    );
    expect(result.severity).toBe('critical');
  });
});

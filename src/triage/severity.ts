import type { Severity, SentryEvent } from '../types.js';

export interface SeverityConfig {
  criticalPatterns: string[];
  majorPatterns: string[];
  securityPatterns: string[];
  frequencyThreshold: {
    major: number;
    critical: number;
  };
}

export interface SeverityResult {
  severity: Severity;
  reason: string;
}

export function classifySeverity(
  event: SentryEvent,
  eventCount24h: number,
  config: SeverityConfig,
): SeverityResult {
  const subject = `${event.errorType} ${event.message} ${event.culprit}`.toLowerCase();

  // Security check takes absolute precedence
  for (const pattern of config.securityPatterns) {
    if (matchesPattern(subject, event.tags, pattern)) {
      return {
        severity: 'security',
        reason: `Matched security pattern: ${pattern}`,
      };
    }
  }

  // Frequency-based upgrades
  if (eventCount24h >= config.frequencyThreshold.critical) {
    return {
      severity: 'critical',
      reason: `Event frequency ${eventCount24h} exceeds critical threshold ${config.frequencyThreshold.critical}`,
    };
  }

  // Pattern-based critical
  for (const pattern of config.criticalPatterns) {
    if (matchesPattern(subject, event.tags, pattern)) {
      return { severity: 'critical', reason: `Matched critical pattern: ${pattern}` };
    }
  }

  // Frequency-based major
  if (eventCount24h >= config.frequencyThreshold.major) {
    return {
      severity: 'major',
      reason: `Event frequency ${eventCount24h} exceeds major threshold ${config.frequencyThreshold.major}`,
    };
  }

  // Pattern-based major
  for (const pattern of config.majorPatterns) {
    if (matchesPattern(subject, event.tags, pattern)) {
      return { severity: 'major', reason: `Matched major pattern: ${pattern}` };
    }
  }

  return { severity: 'minor', reason: 'No elevated severity patterns matched' };
}

function matchesPattern(
  subject: string,
  tags: Record<string, string>,
  pattern: string,
): boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(subject)) return true;
    // Also check tags
    const tagValues = Object.values(tags).join(' ');
    return regex.test(tagValues);
  } catch {
    // Invalid regex — fall back to case-insensitive substring
    return subject.includes(pattern.toLowerCase());
  }
}

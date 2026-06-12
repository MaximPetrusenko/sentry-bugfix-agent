# ADR 004: Security-classified issues are never dispatched to the agent

**Status**: Accepted  
**Date**: 2024-01-01

## Context

Security bugs (SQL injection, XSS, authentication bypasses, authorization flaws) require specialized expertise. An AI agent generating a fix for a security issue could: produce an incomplete fix that appears to work but leaves the vulnerability open; leak the vulnerability details in a public PR; or introduce a new vulnerability while fixing the old one.

## Decision

The triage engine classifies issues matching any security pattern as `severity: security` and sets `shouldAutoFix: false`. The pipeline stops at the triage gate and logs the issue for human attention. The agent never receives the issue context, stack trace, or source files for security-classified issues.

The security patterns are configurable in `bugfix-agent.config.yaml` under `triage.severity.securityPatterns`. Defaults include: `security`, `auth`, `injection`, `xss`, `sqli`, `csrf`. Teams should extend this list for their domain (e.g., `privilege escalation`, `deserialization`).

This is enforced in the triage engine (`src/triage/index.ts`) which returns `shouldAutoFix: false` before any context assembly or agent dispatch happens.

## Consequences

- Security issues always go to a human. This is the correct policy: security bugs require careful, context-aware remediation, not an LLM's best guess.
- False positives (an issue incorrectly classified as security) result in a missed auto-fix opportunity — an acceptable outcome. False negatives (a security issue incorrectly classified as non-security) are the dangerous case, which is why the pattern list should be conservative.
- Teams should monitor which issues are being flagged as security and refine the patterns accordingly.

## Alternatives considered

- Allow agents to fix security issues with extra guardrails: rejected. The risk of an incorrect or incomplete security fix is too high. The value of human review for security issues outweighs the time savings.
- LLM-based security classification: rejected for the default path. LLM classification can produce false negatives, and the consequences of missing a security issue are severe. Pattern matching is simple, auditable, and conservative.

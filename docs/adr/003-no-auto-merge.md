# ADR 003: No auto-merge, enforced by code absence

**Status**: Accepted  
**Date**: 2024-01-01

## Context

An agentic pipeline that can merge code autonomously creates an extremely high-risk surface. A single triage failure, guardrail bypass, or model hallucination could merge broken or malicious code into the main branch without human review.

## Decision

The pipeline never merges pull requests. There is no merge code path anywhere in the codebase. The delivery module creates branches and opens PRs; it has no `merge` capability. GitHub branch protection rules should be configured to require review before merging.

The no-merge constraint is enforced by **code absence**, not configuration. There is no "merge if CI passes" feature hidden behind a flag. Adding auto-merge would require writing new code and passing review — it is not an accidental `config.autoMerge = true` away.

## Consequences

- Humans must review every PR the pipeline opens. This is the correct default for v1 of any agent that modifies production code.
- The pipeline's value is in saving triage and context-gathering time, not in removing human judgment from the merge decision.
- Future versions could introduce a higher-confidence merge path (e.g., for trivially mechanical fixes with 100% test coverage on the change), but that would be a new, reviewed feature — not the default.

## Alternatives considered

- Auto-merge when CI passes: rejected. CI passing does not mean the fix is semantically correct. The agent can produce plausible-looking but logically wrong fixes.
- Auto-merge for `minor` severity only: rejected. Severity classification is based on heuristics and can be wrong. The risk of a misclassified security issue being auto-merged is unacceptable.

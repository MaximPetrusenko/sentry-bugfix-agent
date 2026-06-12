# ADR 002: Use MCP to mediate all agent tool calls

**Status**: Accepted  
**Date**: 2024-01-01

## Context

The AI coding agent needs to read files and fetch issue context. The simplest approach would be to include all relevant file contents in the prompt (context stuffing) or give the agent a shell tool. Both approaches have safety problems.

## Decision

Implement a small MCP server (`src/mcp-server/`) that exposes exactly three tools:
- `read_repo_file` — reads a file from the repo, path-checked against guardrails before serving
- `get_issue_context` — fetches Sentry issue details via the mediated client
- `propose_diff` — accepts the agent's proposed diff for recording

Every tool call is logged. Path checking runs inside the MCP server before any file is served.

## Consequences

- Agent tool calls are fully auditable — the MCP server is in our code, not a black box.
- Path guardrails apply at the read layer, not just the write layer. The agent cannot even read files outside the allowed paths.
- The agent interface is well-defined and stable. Adding a new tool capability means adding an MCP tool with explicit logging, not expanding shell access.
- Slightly more complex than context stuffing, but avoids prompt length blowup for large files and enables interactive agent loops.

## Alternatives considered

- Context stuffing only: rejected. For large repos, including all relevant files upfront hits context limits. Interactive file reading is more efficient and more like how a human developer works.
- Raw shell access (`bash` tool): rejected. Impossible to guardrail reliably. An agent with shell access could run `git push`, install packages, or modify any file.
- No MCP (direct API calls in the agent loop): rejected. Would require re-implementing tool call dispatch in this codebase, duplicating what MCP already provides.

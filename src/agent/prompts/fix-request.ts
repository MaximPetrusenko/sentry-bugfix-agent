import type { IssueContext } from '../../types.js';

export function buildFixRequestPrompt(context: IssueContext): string {
  const { triageResult, relevantFiles, gitHistory, sentryDetails } = context;
  const { event, severity, issue } = triageResult;

  const sections: string[] = [];

  sections.push(`# Bug Fix Request

## Sentry Issue
- **Issue ID**: ${issue.id}
- **Title**: ${issue.title}
- **Severity**: ${severity}
- **First seen**: ${issue.firstSeen}
- **Last seen**: ${issue.lastSeen}
- **Event count (24h)**: ${sentryDetails.eventCount24h}
- **Culprit**: ${event.culprit}
- **Environment**: ${event.environment}
- **Sentry link**: ${issue.permalink || '(not available)'}
`);

  sections.push(`## Error Details
- **Error type**: ${event.errorType}
- **Message**: ${event.message}
`);

  if (event.stackTrace.length > 0) {
    const inApp = event.stackTrace.filter((f) => f.inApp);
    const frames = (inApp.length > 0 ? inApp : event.stackTrace).slice(-15);
    sections.push(`## Stack Trace (most recent last)
\`\`\`
${frames
  .map(
    (f) =>
      `  ${f.filename ?? '<unknown>'}:${f.lineNo ?? '?'} in ${f.function ?? '<anonymous>'}` +
      (f.context.length > 0 ? `\n    ${f.context.map(([, line]) => line).join('\n    ')}` : ''),
  )
  .join('\n')}
\`\`\`
`);
  }

  if (event.breadcrumbs.length > 0) {
    const recent = event.breadcrumbs.slice(-10);
    sections.push(`## Recent Breadcrumbs
${recent.map((b) => `- [${b.timestamp}] ${b.category}: ${b.message}`).join('\n')}
`);
  }

  if (relevantFiles.length > 0) {
    sections.push(`## Relevant Source Files

${relevantFiles
  .map(
    (f) => `### \`${f.path}\`
\`\`\`${f.language}
${f.content}
\`\`\``,
  )
  .join('\n\n')}
`);
  }

  if (gitHistory.length > 0) {
    sections.push(`## Recent Git History (relevant files)
${gitHistory
  .slice(0, 5)
  .map(
    (c) =>
      `- \`${c.sha.slice(0, 8)}\` ${c.author} — ${c.message}` +
      (c.filesChanged.length > 0 ? ` (${c.filesChanged.slice(0, 3).join(', ')})` : ''),
  )
  .join('\n')}
`);
  }

  sections.push(`## Your Task

Diagnose the root cause of this error and produce a minimal fix.

Allowed file paths you may modify: determined by the guardrails configuration (files already shown above are safe to modify).

Output a unified diff and explain the root cause and fix rationale as described in your system prompt.`);

  return sections.join('\n');
}

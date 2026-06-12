export type Severity = 'minor' | 'major' | 'critical' | 'security';

export interface SentryEvent {
  id: string;
  issueId: string;
  projectSlug: string;
  environment: string;
  errorType: string;
  message: string;
  culprit: string;
  timestamp: string;
  stackTrace: StackFrame[];
  tags: Record<string, string>;
  breadcrumbs: Breadcrumb[];
  release: string | null;
}

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  permalink: string;
  firstSeen: string;
  lastSeen: string;
  count: string;
  userCount: number;
  status: string;
  level: string;
  platform: string;
  tags: Array<{ key: string; value: string }>;
  project: { slug: string };
}

export interface StackFrame {
  filename: string | null;
  function: string | null;
  lineNo: number | null;
  colNo: number | null;
  context: Array<[number, string]>;
  inApp: boolean;
  module: string | null;
}

export interface Breadcrumb {
  type: string;
  category: string;
  message: string;
  timestamp: string;
  level: string;
}

export interface TriageResult {
  issueId: string;
  severity: Severity;
  shouldAutoFix: boolean;
  reason: string;
  event: SentryEvent;
  issue: SentryIssue;
}

export interface IssueContext {
  triageResult: TriageResult;
  relevantFiles: RepoFile[];
  gitHistory: GitCommit[];
  sentryDetails: SentryIssueDetails;
}

export interface RepoFile {
  path: string;
  content: string;
  language: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  filesChanged: string[];
}

export interface SentryIssueDetails {
  issue: SentryIssue;
  latestEvent: SentryEvent;
  eventCount24h: number;
}

export interface AgentResult {
  success: boolean;
  diff: string;
  explanation: string;
  testAdded: boolean;
  auditLogId: string;
  error?: string;
}

export interface PullRequestResult {
  url: string;
  number: number;
  branch: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  issueId: string;
  severity?: Severity;
  phase:
    | 'intake'
    | 'triage'
    | 'context'
    | 'agent'
    | 'guardrail_check'
    | 'delivery'
    | 'feedback'
    | 'skipped';
  action: string;
  detail: Record<string, unknown>;
}

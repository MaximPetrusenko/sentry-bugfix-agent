import type { SentryIssue, SentryEvent, StackFrame } from '../types.js';

export interface SentryClientOptions {
  token: string;
  organization: string;
  baseUrl?: string;
}

export interface ListIssuesOptions {
  project: string;
  environment?: string;
  query?: string;
  limit?: number;
}

export interface SentryClientInterface {
  listIssues(options: ListIssuesOptions): Promise<SentryIssue[]>;
  getIssue(issueId: string): Promise<SentryIssue>;
  getLatestEvent(issueId: string): Promise<Partial<SentryEvent> | null>;
  getEventCount24h(issueId: string): Promise<number>;
  resolveIssue(issueId: string, comment: string): Promise<void>;
}

export class SentryMcpClient implements SentryClientInterface {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly organization: string;

  constructor(options: SentryClientOptions) {
    this.organization = options.organization;
    this.baseUrl = options.baseUrl ?? 'https://sentry.io/api/0';
    this.headers = {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    };
  }

  async listIssues(options: ListIssuesOptions): Promise<SentryIssue[]> {
    const params = new URLSearchParams({
      project: options.project,
      query: options.query ?? 'is:unresolved',
      limit: String(options.limit ?? 25),
    });
    if (options.environment) params.set('environment', options.environment);

    const url = `${this.baseUrl}/organizations/${this.organization}/issues/?${params.toString()}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Sentry API error ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as SentryIssue[];
    return data;
  }

  async getIssue(issueId: string): Promise<SentryIssue> {
    const url = `${this.baseUrl}/issues/${issueId}/`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Sentry API error ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as SentryIssue;
  }

  async getLatestEvent(issueId: string): Promise<Partial<SentryEvent> | null> {
    const url = `${this.baseUrl}/issues/${issueId}/events/latest/`;
    const response = await fetch(url, { headers: this.headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Sentry API error ${response.status}: ${await response.text()}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await response.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const exceptions: any[] = raw?.exception?.values ?? [];

    const frames: StackFrame[] = exceptions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((ex: any) => ex?.stacktrace?.frames ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        filename: f.filename ?? null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        function: f.function ?? null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        lineNo: f.lineno ?? null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        colNo: f.colno ?? null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        context: f.context_line ? [[f.lineno ?? 0, f.context_line]] : [],
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        inApp: Boolean(f.in_app),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        module: f.module ?? null,
      }));

    return { stackTrace: frames };
  }

  async getEventCount24h(issueId: string): Promise<number> {
    const url = `${this.baseUrl}/issues/${issueId}/stats/?stat=event.count&since=${Math.floor(Date.now() / 1000) - 86400}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) return 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const points: [number, number][] = data?.stats ?? [];
    return points.reduce((sum, [, count]) => sum + count, 0);
  }

  async resolveIssue(issueId: string, comment: string): Promise<void> {
    const commentUrl = `${this.baseUrl}/issues/${issueId}/comments/`;
    await fetch(commentUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ text: comment }),
    });

    const resolveUrl = `${this.baseUrl}/issues/${issueId}/`;
    const response = await fetch(resolveUrl, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ status: 'resolved' }),
    });
    if (!response.ok) {
      throw new Error(`Failed to resolve issue ${issueId}: ${await response.text()}`);
    }
  }
}

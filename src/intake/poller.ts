import type { Config } from '../config.js';
import type { Pipeline } from '../pipeline.js';
import type { SentryEvent, SentryIssue } from '../types.js';
import { SentryMcpClient } from '../context/sentry-client.js';

export interface Poller {
  start(): void;
  stop(): void;
}

export function createPoller(config: Config, pipeline: Pipeline): Poller {
  const client = new SentryMcpClient({
    token: config.sentry.token,
    organization: config.sentry.organization,
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const processedIds = new Set<string>();

  async function poll(): Promise<void> {
    if (running) return;
    running = true;

    try {
      for (const project of config.sentry.projects.filter((p) => p !== '*')) {
        for (const env of config.sentry.environments) {
        const issues = await client.listIssues({
          project,
          environment: env,
          query: 'is:unresolved',
          limit: 25,
        });

        for (const issue of issues) {
          if (processedIds.has(issue.id)) continue;
          processedIds.add(issue.id);

          // Keep the processed set bounded
          if (processedIds.size > 10_000) {
            const first = processedIds.values().next().value;
            if (first !== undefined) processedIds.delete(first);
          }

          try {
            const event = await issueToEvent(client, issue, env);
            await pipeline.processEvent(event);
          } catch (err) {
            console.error(`[poller] Failed to process issue ${issue.id}:`, err);
          }
        }
        } // end env loop
      } // end project loop
    } catch (err) {
      console.error('[poller] Poll failed:', err);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      void poll();
      timer = setInterval(() => void poll(), config.sentry.pollIntervalSeconds * 1000);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

async function issueToEvent(
  client: SentryMcpClient,
  issue: SentryIssue,
  environment: string,
): Promise<SentryEvent> {
  const latestEvent = await client.getLatestEvent(issue.id);
  return {
    id: `poll-${issue.id}`,
    issueId: issue.id,
    projectSlug: issue.project.slug,
    environment,
    errorType: issue.level,
    message: issue.title,
    culprit: issue.culprit,
    timestamp: issue.lastSeen,
    stackTrace: latestEvent?.stackTrace ?? [],
    tags: {},
    breadcrumbs: latestEvent?.breadcrumbs ?? [],
    release: null,
  };
}

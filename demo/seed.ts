/**
 * Seed script: generates Sentry-shaped event payloads and posts them to the
 * sentry-bugfix-agent webhook. Use this to trigger the pipeline locally without
 * needing a live Sentry account.
 *
 * Usage: npx tsx demo/seed.ts
 */
import { createHmac } from 'crypto';

const WEBHOOK_URL = process.env['WEBHOOK_URL'] ?? 'http://localhost:3000/webhook/sentry';
const WEBHOOK_SECRET = process.env['WEBHOOK_SECRET'] ?? 'demo-secret-replace-in-production';
const ENVIRONMENT = process.env['TARGET_ENV'] ?? 'staging';

const DEMO_EVENTS = [
  {
    name: 'Division by zero',
    payload: makeSentryPayload({
      issueId: 'demo-issue-001',
      errorType: 'TypeError',
      message: 'Cannot divide by zero — result is Infinity',
      culprit: 'demo/app.ts in divide',
      filename: 'demo/app.ts',
      functionName: 'divide',
      lineNo: 18,
    }),
  },
  {
    name: 'ReferenceError: users is not defined',
    payload: makeSentryPayload({
      issueId: 'demo-issue-002',
      errorType: 'ReferenceError',
      message: 'users is not defined',
      culprit: 'demo/app.ts in getUser',
      filename: 'demo/app.ts',
      functionName: 'getUser',
      lineNo: 25,
    }),
  },
];

function makeSentryPayload(opts: {
  issueId: string;
  errorType: string;
  message: string;
  culprit: string;
  filename: string;
  functionName: string;
  lineNo: number;
}): object {
  return {
    action: 'triggered',
    data: {
      event: {
        event_id: `seed-evt-${opts.issueId}-${Date.now()}`,
        issue: { id: opts.issueId },
        groupID: opts.issueId,
        environment: ENVIRONMENT,
        level: 'error',
        message: opts.message,
        culprit: opts.culprit,
        timestamp: new Date().toISOString(),
        exception: {
          values: [
            {
              type: opts.errorType,
              value: opts.message,
              stacktrace: {
                frames: [
                  {
                    filename: opts.filename,
                    function: opts.functionName,
                    lineno: opts.lineNo,
                    colno: 1,
                    in_app: true,
                    context_line: '  return numerator / denominator;',
                    module: 'demo/app',
                  },
                ],
              },
            },
          ],
        },
        tags: [['environment', ENVIRONMENT]],
        breadcrumbs: {
          values: [
            {
              type: 'http',
              category: 'request',
              message: `GET /divide?a=10&b=0`,
              timestamp: new Date().toISOString(),
              level: 'info',
            },
          ],
        },
        project: 'demo-app',
        release: '1.0.0-demo',
      },
    },
  };
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf-8').digest('hex');
}

async function seed(): Promise<void> {
  console.log(`[seed] Sending ${DEMO_EVENTS.length} demo events to ${WEBHOOK_URL}`);

  for (const { name, payload } of DEMO_EVENTS) {
    const body = JSON.stringify(payload);
    const signature = sign(body, WEBHOOK_SECRET);

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sentry-hook-resource': 'event_alert',
        'sentry-hook-signature': signature,
      },
      body,
    });

    const result = (await response.json()) as { received: boolean; processed: boolean };
    console.log(`[seed] ${name}: ${response.status} — ${JSON.stringify(result)}`);
    // Small delay between events
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('[seed] Done. Check the pipeline logs and audit.jsonl for activity.');
}

await seed();

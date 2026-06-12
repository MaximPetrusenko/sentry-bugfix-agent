import { createHmac, timingSafeEqual } from 'crypto';
import express, { type Request, type Response } from 'express';
import type { Config } from '../config.js';
import type { Pipeline } from '../pipeline.js';
import type { SentryEvent } from '../types.js';

export function createWebhookServer(config: Config, pipeline: Pipeline): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/webhook/sentry', (req: Request, res: Response) => {
    const signature = req.headers['sentry-hook-signature'];
    if (typeof signature !== 'string') {
      res.status(401).json({ error: 'Missing sentry-hook-signature header' });
      return;
    }

    if (!verifySignature(req.body as string, signature, config.sentry.webhookSecret)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const resource = req.headers['sentry-hook-resource'];
    if (resource !== 'event_alert' && resource !== 'issue') {
      // Acknowledge but ignore non-event webhooks
      res.status(200).json({ received: true, processed: false });
      return;
    }

    const event = parseSentryWebhookPayload(req.body);
    if (!event) {
      res.status(200).json({ received: true, processed: false, reason: 'unparseable' });
      return;
    }

    if (!config.sentry.environments.includes(event.environment)) {
      res.status(200).json({ received: true, processed: false, reason: 'environment_filtered' });
      return;
    }

    // Fire-and-forget — respond immediately to Sentry
    void pipeline.processEvent(event).catch((err: unknown) => {
      console.error('[webhook] Pipeline error:', err);
    });

    res.status(200).json({ received: true, processed: true });
  });

  return app;
}

export function verifySignature(body: unknown, signature: string, secret: string): boolean {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const expected = createHmac('sha256', secret).update(bodyStr, 'utf-8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSentryWebhookPayload(payload: any): SentryEvent | null {
  try {
    // Sentry sends either event_alert or issue webhook formats
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = payload?.data?.event ?? payload?.data;
    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return normalizeSentryEvent(data, payload);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSentryEvent(event: any, payload: any): SentryEvent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const issueId: string = String(event.issue?.id ?? payload?.data?.issue?.id ?? event.groupID ?? '');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const environment: string = String(event.environment ?? event.tags?.environment ?? 'unknown');

  // Extract stack frames from exception values
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const exceptions: any[] = event.exception?.values ?? [];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const frames = exceptions.flatMap((ex: any) => ex?.stacktrace?.frames ?? []).map((f: any) => ({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    filename: f.filename ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    function: f.function ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    lineNo: f.lineno ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    colNo: f.colno ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    context: f.context_line ? ([[f.lineno ?? 0, String(f.context_line)]] as [number, string][]) : ([] as [number, string][]),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    inApp: Boolean(f.in_app),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    module: f.module ?? null,
  }));

  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    id: String(event.event_id ?? event.id ?? ''),
    issueId,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    projectSlug: String(event.project ?? payload?.data?.project?.slug ?? ''),
    environment,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    errorType: String(exceptions[0]?.type ?? event.level ?? 'error'),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    message: String(exceptions[0]?.value ?? event.message ?? event.title ?? ''),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    culprit: String(event.culprit ?? event.transaction ?? ''),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    timestamp: String(event.timestamp ?? new Date().toISOString()),
    stackTrace: frames,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    tags: Object.fromEntries((event.tags ?? []).map(([k, v]: [string, string]) => [k, v])),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    breadcrumbs: (event.breadcrumbs?.values ?? []).map((b: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      type: b.type ?? 'default',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      category: b.category ?? '',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      message: b.message ?? '',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      timestamp: b.timestamp ?? '',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      level: b.level ?? 'info',
    })),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    release: event.release ?? null,
  };
}

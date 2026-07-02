import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { z } from 'zod';

const EnvString = z.string().transform((val) => {
  const match = /^\$\{([^}]+)\}$/.exec(val);
  if (match) {
    const envVar = match[1];
    if (!envVar) throw new Error(`Empty env var reference`);
    const resolved = process.env[envVar];
    if (!resolved) throw new Error(`Required environment variable ${envVar} is not set`);
    return resolved;
  }
  return val;
});

const SentryConfigSchema = z.object({
  token: EnvString,
  webhookSecret: EnvString,
  organization: z.string().min(1),
  project: z.string().min(1),
  environments: z
    .array(z.string())
    .min(1)
    .refine(
      (envs) => !envs.some((e) => e.toLowerCase() === 'production'),
      'production environment is not allowed — this pipeline is for non-production environments only',
    ),
  pollIntervalSeconds: z.number().int().min(0).default(60),
});

const GitHubConfigSchema = z.object({
  token: EnvString,
  owner: z.string().min(1),
  repo: z.string().min(1),
  baseBranch: z.string().min(1).default('main'),
});

const AnthropicConfigSchema = z.object({
  apiKey: EnvString,
  model: z.string().min(1).default('claude-opus-4-8'),
  maxTokensPerTurn: z.number().int().min(1).max(32768).default(8192),
});

const GuardrailsConfigSchema = z.object({
  allowedPaths: z.array(z.string()).min(1),
  deniedPaths: z.array(z.string()).default([
    'infra/**',
    'deploy/**',
    '.github/**',
    '**/*.lock',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
    'Dockerfile',
    'docker-compose*.yml',
    '.env*',
  ]),
  maxDiffLines: z.number().int().min(1).max(2000).default(200),
  maxAgentRunsPerHour: z.number().int().min(1).default(5),
  maxAgentRunsPerDay: z.number().int().min(1).default(20),
});

const TriageConfigSchema = z.object({
  severity: z.object({
    criticalPatterns: z.array(z.string()).default([]),
    majorPatterns: z.array(z.string()).default([]),
    securityPatterns: z.array(z.string()).default(['security', 'auth', 'injection', 'xss']),
    frequencyThreshold: z
      .object({
        major: z.number().int().min(1).default(10),
        critical: z.number().int().min(1).default(100),
      })
      .default({}),
  }),
  useLlmClassification: z.boolean().default(false),
});

const AuditConfigSchema = z.object({
  logPath: z.string().default('./audit.jsonl'),
});

const FeedbackConfigSchema = z.object({
  // When true, resolves the Sentry issue automatically after the fix PR is merged.
  // Defaults to false — you confirm the fix works before resolving manually.
  autoResolveOnMerge: z.boolean().default(false),
});

const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
});

export const ConfigSchema = z.object({
  sentry: SentryConfigSchema,
  github: GitHubConfigSchema,
  anthropic: AnthropicConfigSchema,
  guardrails: GuardrailsConfigSchema,
  triage: TriageConfigSchema.default({
    severity: {
      criticalPatterns: [],
      majorPatterns: [],
      securityPatterns: ['security', 'auth', 'injection', 'xss'],
      frequencyThreshold: { major: 10, critical: 100 },
    },
    useLlmClassification: false,
  }),
  audit: AuditConfigSchema.default({}),
  feedback: FeedbackConfigSchema.default({}),
  server: ServerConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(configPath: string): Config {
  let raw: unknown;
  try {
    const contents = readFileSync(configPath, 'utf-8');
    raw = load(contents);
  } catch (err) {
    throw new Error(`Failed to read config file ${configPath}: ${String(err)}`);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return result.data;
}

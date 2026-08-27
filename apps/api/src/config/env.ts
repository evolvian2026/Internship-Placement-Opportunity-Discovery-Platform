import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const bool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : v === 'true' || v === '1'));

const int = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .pipe(z.number().int());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  WEB_BASE_URL: z.string().default('http://localhost:3000'),
  PUBLIC_SITE_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Prisma's pool defaults to (cores * 2 + 1), which on a small container is
   * around nine — fewer connections than a single search can ask for at once.
   * Size it deliberately instead, against what the database will accept.
   */
  DATABASE_CONNECTION_LIMIT: int(25),
  DATABASE_POOL_TIMEOUT_SECONDS: int(20),
  /** Must exceed the idle timeout of whatever proxies to this service. */
  KEEP_ALIVE_TIMEOUT_MS: int(65_000),
  REQUEST_TIMEOUT_MS: int(120_000),

  REDIS_URL: z.string().optional().default(''),
  QUEUE_ENABLED: bool(true),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: int(900),
  JWT_REFRESH_TTL_DAYS: int(30),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),

  DATA_SOURCE: z.enum(['mock', 'live']).default('mock'),
  INGESTION_ENABLED: bool(true),
  INGESTION_USER_AGENT: z
    .string()
    .default('OpportunityDiscoveryBot/1.0 (+https://example.com/bot)'),
  INGESTION_DEFAULT_RATE_LIMIT: int(30),
  INGESTION_RESPECT_ROBOTS: bool(true),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('ap-south-1'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: int(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Opportunity Discovery <no-reply@example.com>'),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ASSISTANT_MODEL: z.string().default('claude-sonnet-5'),
  ASSISTANT_ENABLED: bool(true),

  RATE_LIMIT_WINDOW_MS: int(60_000),
  RATE_LIMIT_MAX: int(300),
  AUTH_RATE_LIMIT_MAX: int(20),
  MAX_RESUME_SIZE_MB: int(5),

  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  /** Queues only run when Redis is configured *and* not disabled. */
  queueEnabled: parsed.data.QUEUE_ENABLED && parsed.data.REDIS_URL.length > 0,
  /** Mock mode drives the whole product without any external source. */
  mockMode: parsed.data.DATA_SOURCE === 'mock',
};

export type Env = typeof env;

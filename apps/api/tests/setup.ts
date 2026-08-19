import dotenv from 'dotenv';
import path from 'node:path';

/**
 * Vitest setup.
 *
 * `.env` is loaded here explicitly because this file runs before the app's own
 * config module, which is what reads TEST_DATABASE_URL.
 *
 * Integration tests point at TEST_DATABASE_URL so a test run can never touch
 * development data. Unit tests are pure and need no database at all.
 */
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-at-least-32-characters';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/opportunities_test?schema=public';

if (!/test/i.test(testDatabaseUrl)) {
  // Refuse to run destructive suites against a database that is not a test one.
  throw new Error(`Refusing to run tests against "${testDatabaseUrl}" — the URL must name a test database.`);
}
process.env.DATABASE_URL = testDatabaseUrl;

// Queues and Redis are not exercised by tests; the in-process path is used.
process.env.REDIS_URL = '';
process.env.QUEUE_ENABLED = 'false';
process.env.DATA_SOURCE = 'mock';
process.env.INGESTION_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.SMTP_HOST = '';
process.env.ANTHROPIC_API_KEY = '';

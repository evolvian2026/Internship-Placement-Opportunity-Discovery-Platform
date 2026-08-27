import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Redis outage contract.
 *
 * A Redis that is *configured but unreachable* is the dangerous case: the
 * client accepts commands and simply never answers them. The original cache
 * client shared BullMQ's `maxRetriesPerRequest: null`, which queues a command
 * indefinitely instead of rejecting it — so `cached()`'s try/catch never ran
 * and every cached endpoint, including the health check a load balancer polls,
 * hung until the caller gave up. A cache miss must cost one database query,
 * never the request.
 *
 * These tests point the cache client at a port with nothing behind it, so the
 * only way to pass is to fail fast and fall back.
 */

const UNREACHABLE = 'redis://127.0.0.1:9';

// Commands are bounded at 500ms; allow generous headroom and still catch a hang.
const MUST_ANSWER_WITHIN_MS = 5_000;

vi.mock('../../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/env')>();
  return { ...actual, env: { ...actual.env, REDIS_URL: UNREACHABLE } };
});

const { cached, invalidateCache, pingCache, closeRedis } = await import('../../src/lib/redis');

afterAll(async () => {
  await closeRedis();
});

describe('cache behaviour when Redis is unreachable', () => {
  it('falls back to the producer instead of hanging', async () => {
    const producer = vi.fn(async () => ({ value: 'from the database' }));

    const started = Date.now();
    const result = await cached('degradation:read', 60, producer);
    const elapsed = Date.now() - started;

    expect(result).toEqual({ value: 'from the database' });
    expect(producer).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(MUST_ANSWER_WITHIN_MS);
  });

  it('reports the outage rather than stalling the health check', async () => {
    const started = Date.now();
    const healthy = await pingCache();

    expect(healthy).toBe(false);
    expect(Date.now() - started).toBeLessThan(MUST_ANSWER_WITHIN_MS);
  });

  it('gives up on invalidation without failing the write that triggered it', async () => {
    const started = Date.now();

    await expect(invalidateCache('degradation:*')).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(MUST_ANSWER_WITHIN_MS);
  });
});

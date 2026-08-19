import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

let client: Redis | null = null;

/**
 * Shared Redis connection.
 * Returns `null` when Redis is not configured — every caller must handle that
 * so the platform still runs (with the in-process scheduler) without Redis.
 */
export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.warn({ err: err.message }, 'redis connection error'));
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}

/** Small helper for read-through caching of expensive aggregate queries. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return producer();

  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // A cache read failure must never fail the request.
  }

  const value = await producer();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // ignore
  }
  return value;
}

export async function invalidateCache(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    // ignore
  }
}

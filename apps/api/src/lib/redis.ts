import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

let queueClient: Redis | null = null;
let cacheClient: Redis | null = null;

/**
 * Cache commands must fail fast rather than wait for Redis to come back: a
 * cache miss costs one database query, a hung command costs the request.
 */
const CACHE_COMMAND_TIMEOUT_MS = 500;

/** Connection errors arrive once per retry; log at most one line per window. */
const ERROR_LOG_INTERVAL_MS = 30_000;

function attachErrorLogging(client: Redis, role: string): void {
  let lastLoggedAt = 0;
  let suppressed = 0;

  client.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < ERROR_LOG_INTERVAL_MS) {
      suppressed += 1;
      return;
    }
    logger.warn(
      { err: err.message, role, suppressed },
      'redis connection error',
    );
    lastLoggedAt = now;
    suppressed = 0;
  });
}

/**
 * Shared Redis connection for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` so its blocking reads are never
 * abandoned mid-wait. That setting also means a command issued while the
 * connection is down is queued indefinitely instead of rejecting, so this
 * client must not be used for anything on the request path — see
 * `getCacheRedis()`.
 *
 * Returns `null` when Redis is not configured — every caller must handle that
 * so the platform still runs (with the in-process scheduler) without Redis.
 */
export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (queueClient) return queueClient;

  queueClient = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  attachErrorLogging(queueClient, 'queue');
  return queueClient;
}

/**
 * Separate connection for read-through caching and health probes.
 *
 * `commandTimeout` bounds every command from the moment it is queued, so one
 * that is waiting on a dead socket rejects instead of hanging and each
 * caller's catch block falls back to the source of truth. The offline queue
 * stays on deliberately: switching it off would also reject during the normal
 * connect window at boot, turning a healthy start into a burst of cache
 * misses and silently skipped invalidations.
 */
export function getCacheRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (cacheClient) return cacheClient;

  cacheClient = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: CACHE_COMMAND_TIMEOUT_MS,
    enableReadyCheck: false,
    lazyConnect: false,
    // Back off to a 5s ceiling so a long outage does not spin the event loop.
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  attachErrorLogging(cacheClient, 'cache');
  return cacheClient;
}

export async function closeRedis(): Promise<void> {
  const clients = [queueClient, cacheClient].filter((c): c is Redis => c != null);
  queueClient = null;
  cacheClient = null;
  await Promise.all(
    clients.map(async (c) => {
      // A client still retrying its first connect cannot complete QUIT; drop
      // the socket so the process is free to exit either way.
      await c.quit().catch(() => undefined);
      c.disconnect();
    }),
  );
}

/**
 * Health probe. Resolves to `null` when Redis is not configured, `false` when
 * it is configured but unreachable — never hangs, so a load balancer polling
 * the health endpoint always gets an answer.
 */
export async function pingCache(): Promise<boolean | null> {
  const redis = getCacheRedis();
  if (!redis) return null;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/** Small helper for read-through caching of expensive aggregate queries. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const redis = getCacheRedis();
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
  const redis = getCacheRedis();
  if (!redis) return;
  try {
    // SCAN rather than KEYS: KEYS blocks the whole server for the length of
    // the keyspace, which at catalogue scale is a stall every admin edit.
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length) await redis.unlink(...keys);
    } while (cursor !== '0');
  } catch {
    // ignore
  }
}

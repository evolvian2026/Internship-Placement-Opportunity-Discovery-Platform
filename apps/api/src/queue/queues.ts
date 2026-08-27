import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';
import type { JobName, JobPayloads } from './jobs';

/**
 * BullMQ queue wiring.
 *
 * Everything degrades gracefully: when Redis is absent `enqueue` runs the job
 * inline instead of failing, so a single-process deployment still works.
 */

export const QUEUE_NAME = 'odp-jobs';

/** Retry with exponential backoff; exhausted jobs stay for inspection. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 200, age: 7 * 24 * 60 * 60 },
  // Failed jobs are kept — this is the dead-letter view in the admin panel.
  removeOnFail: { count: 500, age: 30 * 24 * 60 * 60 },
};

let queue: Queue | null = null;

export function getQueue(): Queue | null {
  if (!env.queueEnabled) return null;
  if (queue) return queue;

  const connection = getRedis();
  if (!connection) return null;

  queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  return queue;
}

export async function enqueue<K extends JobName>(
  name: K,
  payload: JobPayloads[K],
  options: JobsOptions = {},
): Promise<void> {
  const q = getQueue();

  if (!q) {
    // No Redis: run inline so the caller's intent is still honoured.
    const { executeJob } = await import('./jobs');
    void executeJob(name, payload).catch((err) => logger.error({ err, name }, 'inline job failed'));
    return;
  }

  await q.add(name, payload, options);
}

/** Registers the recurring schedule (requirement 35). */
export async function registerRepeatableJobs(): Promise<void> {
  const q = getQueue();
  if (!q) return;

  const schedule: { name: JobName; cron: string }[] = [
    // Ingestion runs every 3 hours; individual sources may override this.
    { name: 'ingest:all', cron: '0 */3 * * *' },
    // Freshness sweep hourly so expired postings leave the feed quickly.
    { name: 'maintenance:freshness', cron: '15 * * * *' },
    // Daily digests, staggered so they do not contend.
    { name: 'notify:deadlines', cron: '30 3 * * *' },
    { name: 'notify:new-matches', cron: '0 4 * * *' },
    // Saved-search alerts run more often than the daily digest: government
    // notification windows are short, and the per-search frequency setting
    // decides who actually gets told on any given pass.
    { name: 'notify:saved-searches', cron: '0 */6 * * *' },
    { name: 'notify:followed-companies', cron: '30 4 * * *' },
    { name: 'notify:follow-ups', cron: '0 5 * * *' },
  ];

  for (const entry of schedule) {
    await q.add(
      entry.name,
      {} as never,
      { repeat: { pattern: entry.cron }, jobId: `repeat:${entry.name}` },
    );
  }

  logger.info({ jobs: schedule.length }, 'repeatable jobs registered');
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
}

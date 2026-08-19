import { Worker } from 'bullmq';
import { env } from './config/env';
import { logger } from './lib/logger';
import { getRedis, closeRedis } from './lib/redis';
import { disconnectPrisma } from './lib/prisma';
import { executeJob, type JobName, type JobPayloads } from './queue/jobs';
import { QUEUE_NAME, closeQueue, registerRepeatableJobs } from './queue/queues';
import { startScheduler, stopScheduler } from './queue/scheduler';

/**
 * Background worker process.
 *
 * Runs source connectors, the freshness sweep and notification digests off the
 * request path, so no HTTP request ever waits on an external source.
 */
async function main(): Promise<void> {
  const connection = getRedis();

  if (!connection || !env.queueEnabled) {
    logger.warn('Redis is not configured — falling back to the in-process scheduler');
    startScheduler();
    process.on('SIGTERM', () => {
      stopScheduler();
      process.exit(0);
    });
    return;
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => executeJob(job.name as JobName, job.data as JobPayloads[JobName]),
    {
      connection,
      // Source fetches are IO-bound; a small pool keeps external sites happy.
      concurrency: 4,
      limiter: { max: 20, duration: 1000 },
    },
  );

  worker.on('completed', (job) => logger.info({ job: job.name, id: job.id }, 'job completed'));
  worker.on('failed', (job, err) => {
    logger.error(
      { job: job?.name, id: job?.id, attempts: job?.attemptsMade, err: err.message },
      'job failed',
    );
  });

  await registerRepeatableJobs();
  logger.info({ queue: QUEUE_NAME, dataSource: env.DATA_SOURCE }, 'worker ready');

  const shutdown = async (): Promise<void> => {
    logger.info('worker shutting down');
    await worker.close();
    await closeQueue();
    await Promise.allSettled([disconnectPrisma(), closeRedis()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();

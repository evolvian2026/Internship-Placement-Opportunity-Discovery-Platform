import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';
import { closeRedis } from './lib/redis';
import { startScheduler, stopScheduler } from './queue/scheduler';

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, dataSource: env.DATA_SOURCE, queues: env.queueEnabled },
      'API listening',
    );
  });

  // Without Redis the API process also runs the recurring jobs, so a developer
  // gets deadline reminders and verification without a separate worker.
  if (env.INGESTION_ENABLED && !env.queueEnabled) {
    startScheduler();
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    stopScheduler();
    server.close();
    await Promise.allSettled([disconnectPrisma(), closeRedis()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });
}

void main();

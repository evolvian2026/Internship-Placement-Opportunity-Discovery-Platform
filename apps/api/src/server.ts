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

  // Node keeps idle connections for 5s by default, which is shorter than the
  // idle timeout of every load balancer that would sit in front of this. The
  // balancer then reuses a socket the server is closing and reports a 502 that
  // never reached the application. Outlive it, and keep headersTimeout above
  // keepAliveTimeout as Node requires.
  server.keepAliveTimeout = env.KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = env.KEEP_ALIVE_TIMEOUT_MS + 5_000;
  server.requestTimeout = env.REQUEST_TIMEOUT_MS;

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

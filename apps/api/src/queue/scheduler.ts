import { env } from '../config/env';
import { logger } from '../lib/logger';
import { executeJob, type JobName } from './jobs';

/**
 * In-process scheduler.
 *
 * Used when Redis is not configured, so a developer running only `npm run dev`
 * still gets ingestion, expiry and reminders. Production uses BullMQ workers.
 */

interface ScheduledTask {
  name: JobName;
  intervalMs: number;
  /** Delay before the first run, to keep boot fast. */
  initialDelayMs: number;
}

const HOUR = 60 * 60 * 1000;

const TASKS: ScheduledTask[] = [
  { name: 'ingest:all', intervalMs: 3 * HOUR, initialDelayMs: 10_000 },
  { name: 'maintenance:freshness', intervalMs: HOUR, initialDelayMs: 60_000 },
  { name: 'notify:deadlines', intervalMs: 12 * HOUR, initialDelayMs: 120_000 },
  { name: 'notify:new-matches', intervalMs: 24 * HOUR, initialDelayMs: 180_000 },
  { name: 'notify:followed-companies', intervalMs: 12 * HOUR, initialDelayMs: 240_000 },
  { name: 'notify:follow-ups', intervalMs: 12 * HOUR, initialDelayMs: 300_000 },
];

const timers: NodeJS.Timeout[] = [];
let running = false;

export function startScheduler(): void {
  if (running || env.isTest) return;
  running = true;

  for (const task of TASKS) {
    const run = (): void => {
      void executeJob(task.name, {} as never).catch((err) =>
        logger.error({ err, job: task.name }, 'scheduled job failed'),
      );
    };

    const initial = setTimeout(() => {
      run();
      const interval = setInterval(run, task.intervalMs);
      // Timers must not hold the process open during shutdown.
      interval.unref();
      timers.push(interval);
    }, task.initialDelayMs);
    initial.unref();
    timers.push(initial);
  }

  logger.info({ tasks: TASKS.length }, 'in-process scheduler started (Redis not configured)');
}

export function stopScheduler(): void {
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  timers.length = 0;
  running = false;
}

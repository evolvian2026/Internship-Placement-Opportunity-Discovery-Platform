import { logger } from '../lib/logger';
import { runAllSources, runIngestion } from '../ingestion/pipeline';
import { runFreshnessSweep } from '../ingestion/verification';
import {
  sendApplicationFollowUps,
  sendDeadlineReminders,
  sendFollowedCompanyAlerts,
  sendNewMatchDigests,
} from '../modules/notifications/notification.service';

/**
 * The unit of background work. Both the BullMQ worker and the in-process
 * scheduler execute these same functions, so behaviour is identical with and
 * without Redis.
 */

export type JobName =
  | 'ingest:source'
  | 'ingest:all'
  | 'maintenance:freshness'
  | 'notify:deadlines'
  | 'notify:followed-companies'
  | 'notify:follow-ups'
  | 'notify:new-matches';

export interface JobPayloads {
  'ingest:source': { sourceId: string; triggeredBy?: string; limit?: number };
  'ingest:all': { triggeredBy?: string };
  'maintenance:freshness': Record<string, never>;
  'notify:deadlines': Record<string, never>;
  'notify:followed-companies': Record<string, never>;
  'notify:follow-ups': Record<string, never>;
  'notify:new-matches': Record<string, never>;
}

export const JOB_HANDLERS: {
  [K in JobName]: (payload: JobPayloads[K]) => Promise<unknown>;
} = {
  'ingest:source': async (payload) =>
    runIngestion(payload.sourceId, { triggeredBy: payload.triggeredBy, limit: payload.limit }),
  'ingest:all': async (payload) => runAllSources({ triggeredBy: payload.triggeredBy }),
  'maintenance:freshness': async () => runFreshnessSweep(),
  'notify:deadlines': async () => ({ sent: await sendDeadlineReminders() }),
  'notify:followed-companies': async () => ({ sent: await sendFollowedCompanyAlerts() }),
  'notify:follow-ups': async () => ({ sent: await sendApplicationFollowUps() }),
  'notify:new-matches': async () => ({ sent: await sendNewMatchDigests() }),
};

export async function executeJob<K extends JobName>(name: K, payload: JobPayloads[K]): Promise<unknown> {
  const startedAt = Date.now();
  try {
    const result = await JOB_HANDLERS[name](payload);
    logger.info({ job: name, durationMs: Date.now() - startedAt }, 'job complete');
    return result;
  } catch (err) {
    logger.error({ err, job: name }, 'job failed');
    throw err;
  }
}

import type { OpportunityStatus } from '@odp/shared';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { invalidateCache } from '../lib/redis';
import { addDays } from '../lib/dates';
import { getConnector } from './connectors';
import { findDuplicate, mergeOpportunities, reassignPrimarySource } from './dedupe';
import { FRAUD_REVIEW_THRESHOLD, assessFraudRisk } from './fraud';
import { fetchJson, fetchText } from './http';
import { normalize } from './normalizer';
import { persistOpportunity } from './persist';
import type { IngestionCounters, RawOpportunity } from './types';
import { validate } from './validator';

/**
 * The ingestion pipeline:
 *
 *   Source Connector → Raw → Parser → Normalizer → Duplicate Detection
 *     → Eligibility Extraction → Classification → Quality Validation
 *     → Opportunity Database
 *
 * One `IngestionJob` row records the run; per-record outcomes go to
 * `IngestionLog` so the admin ingestion dashboard can explain any failure.
 */

const LOG_BUFFER_LIMIT = 500;

export interface RunOptions {
  triggeredBy?: string;
  limit?: number;
  /** Skip the database write — used to preview a source's output. */
  dryRun?: boolean;
}

export interface RunResult extends IngestionCounters {
  jobId: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  errorMessage: string | null;
  durationMs: number;
}

function statusForNewRow(input: {
  trustLevel: string;
  fraudScore: number;
  validationWarnings: number;
  deadline: Date | null;
}): OpportunityStatus {
  if (input.fraudScore >= FRAUD_REVIEW_THRESHOLD) return 'UNVERIFIED';

  const closingSoon =
    input.deadline != null && input.deadline <= addDays(new Date(), 3);

  if (input.trustLevel === 'OFFICIAL' && input.validationWarnings <= 2) {
    return closingSoon ? 'EXPIRING_SOON' : 'VERIFIED';
  }
  if (input.validationWarnings > 4) return 'UNVERIFIED';
  return closingSoon ? 'EXPIRING_SOON' : 'ACTIVE';
}

export async function runIngestion(sourceId: string, options: RunOptions = {}): Promise<RunResult> {
  const startedAt = Date.now();

  const source = await prisma.sourceConnector.findUniqueOrThrow({ where: { id: sourceId } });

  const job = await prisma.ingestionJob.create({
    data: {
      sourceId,
      status: 'RUNNING',
      startedAt: new Date(),
      triggeredBy: options.triggeredBy ?? 'scheduler',
    },
  });

  const counters: IngestionCounters = {
    fetched: 0,
    created: 0,
    updated: 0,
    duplicates: 0,
    expired: 0,
    failed: 0,
  };
  const logs: Prisma.IngestionLogCreateManyInput[] = [];
  const log = (level: 'info' | 'warn' | 'error', message: string, payload?: unknown, externalId?: string): void => {
    if (logs.length < LOG_BUFFER_LIMIT) {
      logs.push({
        jobId: job.id,
        level,
        message: message.slice(0, 1000),
        externalId,
        payload: (payload as Prisma.InputJsonValue) ?? undefined,
      });
    }
  };

  let errorMessage: string | null = null;
  let status: RunResult['status'] = 'SUCCESS';

  try {
    const connector = getConnector(source.kind);
    if (!connector) throw new Error(`No connector registered for kind ${source.kind}`);

    if (!source.enabled) throw new Error('Source is disabled');

    // Record the access policy we operate this source under.
    if (source.accessPolicyNote !== connector.accessPolicy) {
      await prisma.sourceConnector.update({
        where: { id: sourceId },
        data: { accessPolicyNote: connector.accessPolicy },
      });
    }

    const rateLimit = source.rateLimitPerMinute || env.INGESTION_DEFAULT_RATE_LIMIT;

    const raw: RawOpportunity[] = await connector.fetch({
      sourceId,
      sourceSlug: source.slug,
      config: (source.config as Record<string, unknown>) ?? {},
      limit: options.limit,
      since: source.lastSyncAt ?? undefined,
      fetchText: (url, init) => fetchText(url, { ...init, rateLimitPerMinute: rateLimit }),
      fetchJson: (url, init) => fetchJson(url, { ...init, rateLimitPerMinute: rateLimit }),
      log,
    });

    counters.fetched = raw.length;
    log('info', `connector returned ${raw.length} records`);

    const seenExternalIds = new Set<string>();

    for (const record of raw) {
      try {
        if (seenExternalIds.has(record.externalId)) {
          counters.duplicates += 1;
          log('warn', 'duplicate externalId within the same batch', undefined, record.externalId);
          continue;
        }
        seenExternalIds.add(record.externalId);

        // Parse + classify + normalize.
        const normalized = normalize(record);

        // Quality validation.
        const validation = validate(normalized);
        if (!validation.ok) {
          counters.failed += 1;
          log('error', `rejected: ${validation.errors.join('; ')}`, { errors: validation.errors }, record.externalId);
          continue;
        }

        // Safety heuristics.
        const fraud = assessFraudRisk({
          title: normalized.title,
          description: normalized.description,
          rawText: record.rawText,
          applicationUrl: normalized.applicationUrl,
          sourceUrl: normalized.sourceUrl,
          trustLevel: source.trustLevel,
          salaryMin: normalized.salaryMin,
          salaryMax: normalized.salaryMax,
          opportunityType: normalized.opportunityType,
        });

        if (options.dryRun) {
          counters.created += 1;
          continue;
        }

        // Has this exact source posting been seen before?
        const existingRef = await prisma.opportunitySource.findUnique({
          where: { sourceId_externalId: { sourceId, externalId: normalized.externalId } },
          select: { opportunityId: true },
        });

        let targetId: string | undefined = existingRef?.opportunityId;
        let isDuplicateOfOther = false;

        if (!targetId) {
          // Cross-source duplicate detection.
          const duplicate = await findDuplicate({
            title: normalized.title,
            organizationName: normalized.organizationName,
            description: normalized.description,
            applicationUrl: normalized.applicationUrl,
            city: normalized.locations[0]?.city ?? null,
          });
          if (duplicate) {
            targetId = duplicate.opportunityId;
            isDuplicateOfOther = true;
            counters.duplicates += 1;
            log(
              'info',
              `merged into existing opportunity (${duplicate.reason}, confidence ${duplicate.confidence.toFixed(2)})`,
              { opportunityId: duplicate.opportunityId },
              record.externalId,
            );
          }
        }

        const rowStatus = statusForNewRow({
          trustLevel: source.trustLevel,
          fraudScore: fraud.score,
          validationWarnings: validation.warnings.length,
          deadline: normalized.applicationDeadline,
        });

        const result = await persistOpportunity({
          normalized,
          sourceId,
          status: rowStatus,
          fraudFlags: fraud.flags,
          fraudScore: fraud.score,
          // When this is a duplicate we attach a source ref but must not
          // overwrite the surviving row's own scalar fields.
          existingOpportunityId: targetId,
          isPrimarySource: !isDuplicateOfOther && source.trustLevel === 'OFFICIAL',
          rawPayload: record.rawPayload,
        });

        if (isDuplicateOfOther || existingRef) {
          counters.updated += 1;
        } else {
          counters.created += 1;
        }

        if (isDuplicateOfOther) {
          await reassignPrimarySource(result.opportunityId);
        }

        if (validation.warnings.length) {
          log('warn', validation.warnings.join('; '), { completeness: validation.completeness }, record.externalId);
        }
        if (fraud.flags.length) {
          log('warn', `safety flags: ${fraud.flags.join(', ')}`, { score: fraud.score }, record.externalId);
        }
      } catch (err) {
        counters.failed += 1;
        log('error', `record failed: ${String(err)}`, undefined, record.externalId);
      }
    }

    // Postings this source previously published but no longer lists have most
    // likely closed. They are marked EXPIRED, never silently deleted.
    if (!options.dryRun && raw.length > 0) {
      const stale = await prisma.opportunitySource.findMany({
        where: {
          sourceId,
          externalId: { notIn: [...seenExternalIds] },
          opportunity: { status: { notIn: ['EXPIRED', 'REMOVED'] }, deletedAt: null },
        },
        select: { opportunityId: true },
        take: 1000,
      });

      if (stale.length) {
        const ids = [...new Set(stale.map((s) => s.opportunityId))];
        // Only expire rows this source alone published.
        const soleSourced = await prisma.opportunity.findMany({
          where: { id: { in: ids }, sources: { every: { sourceId } } },
          select: { id: true },
        });
        if (soleSourced.length) {
          const result = await prisma.opportunity.updateMany({
            where: { id: { in: soleSourced.map((o) => o.id) } },
            data: { status: 'EXPIRED' },
          });
          counters.expired = result.count;
          log('info', `expired ${result.count} postings no longer listed by this source`);
        }
      }
    }

    if (counters.failed > 0 || counters.fetched === 0) status = 'WARNING';
  } catch (err) {
    status = 'FAILED';
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, sourceId }, 'ingestion run failed');
    log('error', errorMessage);
  }

  await prisma.$transaction([
    prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status,
        finishedAt: new Date(),
        recordsFetched: counters.fetched,
        recordsCreated: counters.created,
        recordsUpdated: counters.updated,
        recordsExpired: counters.expired,
        recordsDuplicate: counters.duplicates,
        recordsFailed: counters.failed,
        errorMessage,
      },
    }),
    prisma.sourceConnector.update({
      where: { id: sourceId },
      data: { lastSyncAt: new Date(), lastStatus: status },
    }),
    ...(logs.length ? [prisma.ingestionLog.createMany({ data: logs })] : []),
  ]);

  // Ingestion can introduce a new industry or domain, and both the counts and
  // the taxonomy are served from cache.
  await invalidateCache('counts:*');
  await invalidateCache('taxonomy:*');

  return {
    ...counters,
    jobId: job.id,
    status,
    errorMessage,
    durationMs: Date.now() - startedAt,
  };
}

/** Runs every enabled source that matches the current DATA_SOURCE mode. */
export async function runAllSources(options: RunOptions = {}): Promise<RunResult[]> {
  const sources = await prisma.sourceConnector.findMany({
    where: {
      enabled: true,
      // In mock mode only the mock source runs; in live mode everything else does.
      kind: env.mockMode ? 'MOCK' : { not: 'MOCK' },
    },
    select: { id: true, name: true },
  });

  const results: RunResult[] = [];
  for (const source of sources) {
    try {
      results.push(await runIngestion(source.id, options));
    } catch (err) {
      logger.error({ err, source: source.name }, 'source run threw');
    }
  }
  return results;
}

export { mergeOpportunities };

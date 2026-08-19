import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { addDays, startOfDay } from '../lib/dates';
import { politeFetch } from './http';
import { env } from '../config/env';

/**
 * Freshness maintenance (requirement 30/53).
 *
 * Three jobs:
 *  - `expireOverdue`  : anything past its published deadline leaves the feed.
 *  - `markExpiringSoon`: postings closing within 3 days get a visible status.
 *  - `verifyActive`   : re-checks that a posting's URL still resolves, and
 *                       records when it was last confirmed.
 *
 * A posting that cannot be verified is marked UNVERIFIED, never silently kept
 * as if it were still confirmed.
 */

const VERIFY_BATCH_SIZE = 40;
/** Consecutive failed verifications before a posting is treated as removed. */
const MAX_VERIFY_FAILURES = 3;

export async function expireOverdue(now: Date = new Date()): Promise<number> {
  const result = await prisma.opportunity.updateMany({
    where: {
      deletedAt: null,
      applicationDeadline: { lt: startOfDay(now) },
      status: { notIn: ['EXPIRED', 'REMOVED'] },
    },
    data: { status: 'EXPIRED' },
  });
  if (result.count) logger.info({ count: result.count }, 'expired overdue opportunities');
  return result.count;
}

export async function markExpiringSoon(now: Date = new Date()): Promise<number> {
  const result = await prisma.opportunity.updateMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'VERIFIED'] },
      applicationDeadline: { gte: startOfDay(now), lte: addDays(now, 3) },
    },
    data: { status: 'EXPIRING_SOON' },
  });
  return result.count;
}

export interface VerificationResult {
  checked: number;
  confirmed: number;
  failed: number;
  removed: number;
}

/**
 * Re-verifies the oldest-verified active postings.
 *
 * Uses a HEAD-style GET through the same polite client as ingestion, so
 * robots.txt and rate limits still apply. A 404/410 means the posting is gone.
 */
export async function verifyActive(limit = VERIFY_BATCH_SIZE): Promise<VerificationResult> {
  const stale = await prisma.opportunity.findMany({
    where: {
      deletedAt: null,
      mergedIntoId: null,
      status: { in: ['ACTIVE', 'VERIFIED', 'EXPIRING_SOON', 'UNVERIFIED'] },
      OR: [
        { lastVerifiedAt: null },
        { lastVerifiedAt: { lt: addDays(new Date(), -3) } },
      ],
    },
    select: {
      id: true,
      applicationUrl: true,
      verifyFailures: true,
      status: true,
      sources: { select: { id: true, source: { select: { trustLevel: true } } } },
    },
    orderBy: [{ lastVerifiedAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
  });

  const result: VerificationResult = { checked: 0, confirmed: 0, failed: 0, removed: 0 };

  for (const opportunity of stale) {
    result.checked += 1;
    let reachable: boolean;

    try {
      const res = await politeFetch(opportunity.applicationUrl, { method: 'GET' });
      // 404/410 mean the posting is gone; anything else 2xx/3xx counts as live.
      reachable = res.status !== 404 && res.status !== 410;
    } catch (err) {
      // A network hiccup is not proof the posting is gone, so it counts as a
      // soft failure rather than an immediate removal.
      reachable = false;
      logger.debug({ err, id: opportunity.id }, 'verification fetch failed');
    }

    if (reachable) {
      const isOfficial = opportunity.sources.some((s) => s.source.trustLevel === 'OFFICIAL');
      await prisma.$transaction([
        prisma.opportunity.update({
          where: { id: opportunity.id },
          data: {
            lastVerifiedAt: new Date(),
            verifyFailures: 0,
            status:
              opportunity.status === 'UNVERIFIED' && isOfficial ? 'VERIFIED' : opportunity.status,
          },
        }),
        prisma.opportunitySource.updateMany({
          where: { opportunityId: opportunity.id },
          data: { lastVerifiedAt: new Date() },
        }),
      ]);
      result.confirmed += 1;
    } else {
      const failures = opportunity.verifyFailures + 1;
      result.failed += 1;
      if (failures >= MAX_VERIFY_FAILURES) {
        await prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { verifyFailures: failures, status: 'REMOVED' },
        });
        result.removed += 1;
      } else {
        await prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { verifyFailures: failures, status: 'UNVERIFIED' },
        });
      }
    }
  }

  logger.info(result, 'verification pass complete');
  return result;
}

/** One maintenance sweep, run on a schedule. */
export async function runFreshnessSweep(): Promise<{
  expired: number;
  expiringSoon: number;
  verification: VerificationResult | null;
}> {
  const expired = await expireOverdue();
  const expiringSoon = await markExpiringSoon();

  // Mock data has no live URLs to verify against.
  const verification = env.mockMode ? null : await verifyActive();

  return { expired, expiringSoon, verification };
}

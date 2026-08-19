import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { jaccardSimilarity, normalizeCompanyName, normalizeTitle, similarityRatio } from '../lib/text';

/**
 * Duplicate detection (requirement 31).
 *
 * Two stages:
 *  1. A cheap exact fingerprint (company + normalised title + location) that
 *     catches the common "same posting on three boards" case with one indexed
 *     lookup.
 *  2. A bounded fuzzy pass over recent postings from the same organisation,
 *     comparing title similarity, description similarity and application URL.
 *
 * When a duplicate is found the *new* source is attached to the existing
 * opportunity rather than creating a second row, so the UI can say
 * "Found on 3 sources" while Apply still points at the official one.
 */

export interface DedupeCandidate {
  title: string;
  organizationName: string;
  description?: string;
  applicationUrl?: string;
  externalId?: string;
  city?: string | null;
}

/** Stable fingerprint stored on the row and indexed. */
export function computeDedupeHash(candidate: DedupeCandidate): string {
  const parts = [
    normalizeCompanyName(candidate.organizationName),
    normalizeTitle(candidate.title),
    (candidate.city ?? '').toLowerCase().trim(),
  ];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

/** Normalised application URL: host + path, ignoring tracking parameters. */
function canonicalUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.host.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

export interface DuplicateMatch {
  opportunityId: string;
  confidence: number;
  reason: string;
}

const TITLE_THRESHOLD = 0.82;
const DESCRIPTION_THRESHOLD = 0.7;
/** How far back the fuzzy pass looks, in days. */
const LOOKBACK_DAYS = 120;

export async function findDuplicate(candidate: DedupeCandidate): Promise<DuplicateMatch | null> {
  const hash = computeDedupeHash(candidate);

  // Stage 1 — exact fingerprint.
  const exact = await prisma.opportunity.findFirst({
    where: { dedupeHash: hash, deletedAt: null, mergedIntoId: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (exact) {
    return { opportunityId: exact.id, confidence: 1, reason: 'identical company, title and location' };
  }

  // Stage 1b — same application URL is a definitive duplicate.
  const targetUrl = canonicalUrl(candidate.applicationUrl);
  if (targetUrl) {
    const sameUrl = await prisma.opportunity.findFirst({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        applicationUrl: { contains: targetUrl.split('/')[0] },
      },
      select: { id: true, applicationUrl: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });
    if (sameUrl && canonicalUrl(sameUrl.applicationUrl) === targetUrl) {
      return { opportunityId: sameUrl.id, confidence: 0.98, reason: 'identical application URL' };
    }
  }

  // Stage 2 — bounded fuzzy comparison within the same organisation.
  const normalizedOrg = normalizeCompanyName(candidate.organizationName);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const siblings = await prisma.opportunity.findMany({
    where: {
      deletedAt: null,
      mergedIntoId: null,
      createdAt: { gte: since },
      OR: [
        { company: { normalizedName: normalizedOrg } },
        { organizationName: { equals: candidate.organizationName, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      applicationUrl: true,
      locations: { select: { city: true } },
    },
    take: 100,
  });

  const candidateTitle = normalizeTitle(candidate.title);
  const candidateCity = (candidate.city ?? '').toLowerCase().trim();

  let best: DuplicateMatch | null = null;

  for (const sibling of siblings) {
    const titleScore = similarityRatio(candidateTitle, normalizeTitle(sibling.title));
    if (titleScore < TITLE_THRESHOLD) continue;

    // A same-title posting in a different city is a different opening.
    const siblingCities = sibling.locations.map((l) => (l.city ?? '').toLowerCase().trim()).filter(Boolean);
    if (candidateCity && siblingCities.length > 0 && !siblingCities.includes(candidateCity)) continue;

    let confidence = titleScore * 0.7;
    const reasons = [`title ${(titleScore * 100).toFixed(0)}% similar`];

    if (candidate.description && sibling.description) {
      const descScore = jaccardSimilarity(candidate.description, sibling.description);
      confidence += descScore * 0.3;
      if (descScore >= DESCRIPTION_THRESHOLD) reasons.push(`description ${(descScore * 100).toFixed(0)}% similar`);
    } else {
      // Without descriptions to compare, title alone must clear a higher bar.
      confidence = titleScore * 0.85;
    }

    if (confidence >= 0.8 && (!best || confidence > best.confidence)) {
      best = { opportunityId: sibling.id, confidence, reason: reasons.join(', ') };
    }
  }

  return best;
}

/**
 * Merges `duplicateId` into `survivorId`: moves source references across and
 * marks the duplicate so it never appears in search.
 */
export async function mergeOpportunities(survivorId: string, duplicateId: string): Promise<void> {
  if (survivorId === duplicateId) return;

  await prisma.$transaction(async (tx) => {
    const sources = await tx.opportunitySource.findMany({ where: { opportunityId: duplicateId } });

    for (const source of sources) {
      // The unique key is (sourceId, externalId), so a clash means the survivor
      // already carries this exact source reference.
      const existing = await tx.opportunitySource.findUnique({
        where: { sourceId_externalId: { sourceId: source.sourceId, externalId: source.externalId } },
      });
      if (existing && existing.opportunityId !== survivorId) {
        await tx.opportunitySource.update({
          where: { id: existing.id },
          data: { opportunityId: survivorId, isPrimary: false },
        });
      } else if (!existing) {
        await tx.opportunitySource.create({
          data: {
            opportunityId: survivorId,
            sourceId: source.sourceId,
            externalId: source.externalId,
            sourceUrl: source.sourceUrl,
            isPrimary: false,
            lastSeenAt: source.lastSeenAt,
            lastVerifiedAt: source.lastVerifiedAt,
            rawPayload: source.rawPayload ?? undefined,
          },
        });
      }
    }

    await tx.opportunitySource.deleteMany({ where: { opportunityId: duplicateId } });
    await tx.opportunity.update({
      where: { id: duplicateId },
      data: { mergedIntoId: survivorId, status: 'REMOVED' },
    });
  });
}

/**
 * Chooses which source should own the Apply button.
 * Official sources always win; ties break towards the earliest seen.
 */
export async function reassignPrimarySource(opportunityId: string): Promise<void> {
  const sources = await prisma.opportunitySource.findMany({
    where: { opportunityId },
    include: { source: { select: { trustLevel: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (sources.length === 0) return;

  const rank = { OFFICIAL: 0, PARTNER: 1, THIRD_PARTY: 2 } as const;
  const winner = [...sources].sort(
    (a, b) => rank[a.source.trustLevel] - rank[b.source.trustLevel],
  )[0];

  await prisma.$transaction([
    prisma.opportunitySource.updateMany({
      where: { opportunityId, isPrimary: true, NOT: { id: winner.id } },
      data: { isPrimary: false },
    }),
    prisma.opportunitySource.update({ where: { id: winner.id }, data: { isPrimary: true } }),
  ]);
}

import type { NearMissesDto, ProfileUnlocksDto } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { evaluateEligibility } from '../../engines/eligibility';
import { collectNearMisses, collectUnlocks } from '../../engines/insights';
import { buildProfileSnapshot } from '../profile/snapshot';
import { opportunityInclude, type OpportunityWithRelations } from '../opportunities/opportunity.include';
import { toOpportunitySnapshot } from '../opportunities/opportunity.mapper';
import { decorate } from '../opportunities/opportunity.service';
import { LIVE_OPPORTUNITY } from '../opportunities/opportunity.constants';

/**
 * How many live opportunities the insight passes examine.
 *
 * Both features answer "across everything open to me…", so the sample has to be
 * broad — but it is bounded, because this runs on a page load.
 */
const CANDIDATE_LIMIT = 400;

async function loadCandidates(): Promise<OpportunityWithRelations[]> {
  return prisma.opportunity.findMany({
    where: {
      ...LIVE_OPPORTUNITY,
      OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
    },
    include: opportunityInclude,
    orderBy: [{ postedDate: { sort: 'desc', nulls: 'last' } }],
    take: CANDIDATE_LIMIT,
  });
}

/**
 * Feature 1 — which single profile field would resolve the most "we cannot
 * tell" verdicts.
 */
export async function getProfileUnlocks(userId: string): Promise<ProfileUnlocksDto> {
  const profile = await buildProfileSnapshot(userId);
  if (!profile) return { unresolvedCount: 0, examinedCount: 0, unlocks: [] };

  const candidates = await loadCandidates();
  const now = new Date();

  const inputs = candidates.map((opportunity) => ({
    opportunityId: opportunity.id,
    slug: opportunity.slug,
    title: opportunity.title,
    organizationName: opportunity.organizationName,
    eligibility: evaluateEligibility(profile, toOpportunitySnapshot(opportunity), now),
  }));

  return collectUnlocks(inputs);
}

/**
 * Feature 2 — the opportunities the user just misses, grouped by what blocked
 * them and ordered by how close they are.
 */
export async function getNearMisses(userId: string): Promise<NearMissesDto> {
  const profile = await buildProfileSnapshot(userId);
  if (!profile) return { examinedCount: 0, ineligibleCount: 0, groups: [] };

  const candidates = await loadCandidates();
  const now = new Date();

  const analysed = collectNearMisses(
    candidates.map((opportunity) => ({
      opportunity,
      eligibility: evaluateEligibility(profile, toOpportunitySnapshot(opportunity), now),
    })),
  );

  // Decorate only the rows that actually made it into a group.
  const shown = analysed.groups.flatMap((g) => g.items.map((i) => i.opportunity));
  const summaries = await decorate(shown, userId, { persist: false });
  const summaryById = new Map(summaries.map((s) => [s.id, s]));

  return {
    examinedCount: analysed.examinedCount,
    ineligibleCount: analysed.ineligibleCount,
    groups: analysed.groups.map((group) => ({
      key: group.key,
      title: group.title,
      advice: group.advice,
      closable: group.closable,
      items: group.items
        .filter((item) => summaryById.has(item.opportunity.id))
        .map((item) => ({
          opportunity: summaryById.get(item.opportunity.id)!,
          reason: item.reason,
          gap: item.gap,
        })),
    })),
  };
}

import type { EligibilitySummaryDto, MatchScoreDto } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { evaluateEligibility } from '../../engines/eligibility';
import { computeMatch } from '../../engines/matching';
import type { ProfileSnapshot } from '../../engines/types';
import { toOpportunitySnapshot } from './opportunity.mapper';
import type { OpportunityWithRelations } from './opportunity.include';

export interface Scored {
  match: MatchScoreDto;
  eligibility: EligibilitySummaryDto;
}

/** Scores a batch of opportunities in memory — no per-row database calls. */
export function scoreMany(
  profile: ProfileSnapshot,
  opportunities: OpportunityWithRelations[],
  now: Date = new Date(),
): Map<string, Scored> {
  const out = new Map<string, Scored>();
  for (const opportunity of opportunities) {
    const snapshot = toOpportunitySnapshot(opportunity);
    const eligibility = evaluateEligibility(profile, snapshot, now);
    const { eligibilityVerdict: _verdict, ...match } = computeMatch(profile, snapshot, now);
    out.set(opportunity.id, { match, eligibility });
  }
  return out;
}

/**
 * Persists computed scores so the personalised feed can rank inside Postgres
 * instead of loading every opportunity into memory (requirement 45).
 * Failures here are non-fatal: the response is already computed.
 */
export async function persistScores(
  userId: string,
  scores: Map<string, Scored>,
): Promise<void> {
  if (scores.size === 0) return;

  try {
    const rows = [...scores.entries()].map(([opportunityId, { match, eligibility }]) => {
      const byKey = Object.fromEntries(match.components.map((c) => [c.key, c.score]));
      return {
        userId,
        opportunityId,
        overall: match.overall,
        eligibilityScore: byKey.eligibility ?? 0,
        skillsScore: byKey.skills ?? 0,
        educationScore: byKey.education ?? 0,
        locationScore: byKey.location ?? 0,
        experienceScore: byKey.experience ?? 0,
        preferenceScore: byKey.preferences ?? 0,
        eligibilityVerdict: eligibility.verdict,
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        components: match.components as unknown as object,
        computedAt: new Date(),
      };
    });

    await prisma.$transaction(
      rows.map((row) =>
        prisma.matchScore.upsert({
          where: { userId_opportunityId: { userId: row.userId, opportunityId: row.opportunityId } },
          update: row,
          create: row,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, userId }, 'failed to persist match scores');
  }
}

/** Recomputes and stores scores for one user across the active catalogue. */
export async function recomputeForUser(
  profile: ProfileSnapshot,
  opportunities: OpportunityWithRelations[],
): Promise<number> {
  const scores = scoreMany(profile, opportunities);
  await persistScores(profile.userId, scores);
  return scores.size;
}

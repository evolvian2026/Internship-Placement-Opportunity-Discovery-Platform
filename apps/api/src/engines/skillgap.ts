import { SKILL_BY_NAME, type SkillGapDto } from '@odp/shared';
import type { OpportunitySnapshot, ProfileSnapshot } from './types';

/**
 * Skill-gap analysis (requirement 26).
 *
 * Compares the user's skills against either one opportunity or the aggregate
 * demand across a set of opportunities (their target role), and ranks what to
 * learn next by how often it appears and how much it unlocks.
 */

export function analyzeAgainstOpportunity(
  profile: ProfileSnapshot,
  opportunity: OpportunitySnapshot,
): SkillGapDto {
  const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  const have: string[] = [];
  const missing: string[] = [];

  for (const skill of opportunity.skills) {
    if (userSkills.has(skill.name.toLowerCase())) have.push(skill.name);
    else missing.push(skill.name);
  }

  const total = opportunity.skills.length;
  return {
    opportunityId: opportunity.id,
    matchPercent: total === 0 ? 100 : Math.round((have.length / total) * 100),
    haveSkills: have,
    missingSkills: missing,
    recommendedLearning: missing.slice(0, 5).map((skill, index) => ({
      skill,
      reason: `Required for ${opportunity.title} at ${opportunity.organizationName}`,
      priority: index + 1,
    })),
  };
}

export interface DemandEntry {
  skill: string;
  /** How many opportunities in the analysed set require this skill. */
  demand: number;
}

/**
 * Aggregate gap analysis across many opportunities — the version that powers
 * "Recommended Learning" on the dashboard.
 */
export function analyzeAgainstMarket(
  profile: ProfileSnapshot,
  opportunities: OpportunitySnapshot[],
  targetRole?: string,
): SkillGapDto {
  const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  const demand = new Map<string, number>();

  for (const opportunity of opportunities) {
    // Count each skill once per opportunity.
    const seen = new Set<string>();
    for (const skill of opportunity.skills) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      demand.set(skill.name, (demand.get(skill.name) ?? 0) + 1);
    }
  }

  const ranked = [...demand.entries()]
    .map(([skill, count]) => ({ skill, demand: count }))
    .sort((a, b) => b.demand - a.demand);

  const have = ranked.filter((r) => userSkills.has(r.skill.toLowerCase())).map((r) => r.skill);
  const missing = ranked.filter((r) => !userSkills.has(r.skill.toLowerCase()));

  const totalDemand = ranked.reduce((sum, r) => sum + r.demand, 0);
  const coveredDemand = ranked
    .filter((r) => userSkills.has(r.skill.toLowerCase()))
    .reduce((sum, r) => sum + r.demand, 0);

  const opportunityCount = opportunities.length || 1;

  return {
    targetRole,
    // Weighted by demand: missing a skill 40 postings want hurts more than
    // missing one that appears twice.
    matchPercent: totalDemand === 0 ? 100 : Math.round((coveredDemand / totalDemand) * 100),
    haveSkills: have.slice(0, 30),
    missingSkills: missing.map((m) => m.skill).slice(0, 20),
    recommendedLearning: missing.slice(0, 6).map((entry, index) => {
      const share = Math.round((entry.demand / opportunityCount) * 100);
      const category = SKILL_BY_NAME.get(entry.skill)?.category;
      return {
        skill: entry.skill,
        reason:
          `Requested in ${entry.demand} of ${opportunityCount} matching opportunities (${share}%)` +
          (category ? ` · ${category}` : ''),
        priority: index + 1,
      };
    }),
  };
}

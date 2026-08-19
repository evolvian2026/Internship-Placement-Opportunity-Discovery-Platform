import {
  DEGREE_LABELS,
  GOVERNMENT_TYPES,
  INTERNSHIP_TYPES,
  PSU_TYPES,
  SKILL_BY_NAME,
  type MatchComponentDto,
  type MatchScoreDto,
} from '@odp/shared';
import { evaluateEligibility } from './eligibility';
import type { OpportunitySnapshot, ProfileSnapshot } from './types';

/**
 * Matching engine.
 *
 * Rule-based by design (requirement 43): every number is explainable and
 * reproducible. The component structure is what a future ML ranker would slot
 * into — swap `scoreComponents` for a learned model and the rest still works.
 *
 * The single most important behaviour: **eligibility gates the score**.
 * A user never sees a high match on something they clearly cannot apply for.
 */

const WEIGHTS = {
  eligibility: 0.3,
  skills: 0.25,
  education: 0.15,
  experience: 0.1,
  location: 0.1,
  preferences: 0.1,
} as const;

const LABELS: Record<keyof typeof WEIGHTS, string> = {
  eligibility: 'Eligibility',
  skills: 'Skills Match',
  education: 'Education Match',
  experience: 'Experience Match',
  location: 'Location Match',
  preferences: 'Career Preference',
};

/** Skills the user has that are "close enough" via the related-skills graph. */
function relatedCoverage(userSkills: Set<string>, target: string): number {
  const def = SKILL_BY_NAME.get(target);
  if (!def?.related?.length) return 0;
  const hits = def.related.filter((r) => userSkills.has(r.toLowerCase())).length;
  return hits > 0 ? Math.min(0.5, hits / def.related.length) : 0;
}

export interface SkillMatchResult {
  score: number;
  matched: string[];
  missing: string[];
  explanation: string;
}

export function scoreSkills(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): SkillMatchResult {
  const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  const required = opportunity.skills.filter((s) => s.isRequired);
  const optional = opportunity.skills.filter((s) => !s.isRequired);

  if (opportunity.skills.length === 0) {
    return {
      // Nothing published to match against — neutral, not a penalty.
      score: 70,
      matched: [],
      missing: [],
      explanation: 'This posting does not list specific skills.',
    };
  }

  const matched: string[] = [];
  const missing: string[] = [];
  let earned = 0;
  let possible = 0;

  for (const skill of required) {
    const weight = skill.weight || 1;
    possible += weight;
    if (userSkills.has(skill.name.toLowerCase())) {
      earned += weight;
      matched.push(skill.name);
    } else {
      const partial = relatedCoverage(userSkills, skill.name);
      earned += weight * partial;
      missing.push(skill.name);
    }
  }

  // Optional skills add credit but never subtract.
  for (const skill of optional) {
    const weight = (skill.weight || 1) * 0.4;
    possible += weight;
    if (userSkills.has(skill.name.toLowerCase())) {
      earned += weight;
      matched.push(skill.name);
    } else {
      missing.push(skill.name);
    }
  }

  const score = possible === 0 ? 70 : Math.round((earned / possible) * 100);
  const explanation =
    matched.length === 0
      ? `None of the ${opportunity.skills.length} listed skills are on your profile yet.`
      : `${matched.length} of ${opportunity.skills.length} listed skills matched.`;

  return { score: Math.min(100, score), matched, missing, explanation };
}

function scoreEducation(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): MatchComponentDto {
  const criteria = opportunity.eligibility;
  const base = (score: number, explanation: string): MatchComponentDto => ({
    key: 'education',
    label: LABELS.education,
    score,
    weight: WEIGHTS.education,
    explanation,
  });

  if (profile.education.length === 0) {
    return base(40, 'Add your education to improve this score.');
  }
  if (!criteria || (!criteria.degrees.length && !criteria.branches.length && !criteria.graduationYears.length)) {
    return base(75, 'This posting does not publish education criteria.');
  }

  let hits = 0;
  let total = 0;
  const notes: string[] = [];

  if (criteria.degrees.length) {
    total += 1;
    const match = profile.education.find((e) => criteria.degrees.includes(e.degree));
    if (match) {
      hits += 1;
      notes.push(`${DEGREE_LABELS[match.degree]} accepted`);
    }
  }
  if (criteria.branches.length) {
    total += 1;
    const userBranches = profile.education.map((e) => e.branch).filter(Boolean) as string[];
    const anyBranch = criteria.branches.some((b) => /^(all|any)\b/i.test(b));
    if (anyBranch || userBranches.some((b) => criteria.branches.some((c) => c.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(c.toLowerCase())))) {
      hits += 1;
      notes.push(anyBranch ? 'open to all branches' : 'branch accepted');
    }
  }
  if (criteria.graduationYears.length) {
    total += 1;
    const years = profile.education.map((e) => e.graduationYear).filter((y): y is number => y != null);
    if (years.some((y) => criteria.graduationYears.includes(y))) {
      hits += 1;
      notes.push('batch matches');
    }
  }

  const score = total === 0 ? 75 : Math.round((hits / total) * 100);
  return base(score, notes.length ? notes.join(', ') : 'Education criteria not met.');
}

function scoreExperience(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): MatchComponentDto {
  const criteria = opportunity.eligibility;
  const base = (score: number, explanation: string): MatchComponentDto => ({
    key: 'experience',
    label: LABELS.experience,
    score,
    weight: WEIGHTS.experience,
    explanation,
  });

  const minExp = criteria?.minExperienceYears ?? null;
  const maxExp = criteria?.maxExperienceYears ?? null;
  const years = profile.yearsOfExperience;

  if (minExp == null && maxExp == null) {
    return base(75, 'This posting does not publish an experience requirement.');
  }
  if (minExp != null && years < minExp) {
    const shortfall = minExp - years;
    return base(
      Math.max(0, Math.round(100 - shortfall * 40)),
      `Needs ${minExp} year(s); you have ${years}.`,
    );
  }
  if (maxExp != null && years > maxExp) {
    return base(60, `Targets up to ${maxExp} year(s) of experience.`);
  }
  return base(100, minExp === 0 ? 'Open to freshers.' : `Your ${years} year(s) fit the range.`);
}

function scoreLocation(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): MatchComponentDto {
  const base = (score: number, explanation: string): MatchComponentDto => ({
    key: 'location',
    label: LABELS.location,
    score,
    weight: WEIGHTS.location,
    explanation,
  });

  const isRemote = opportunity.workMode === 'REMOTE' || opportunity.locations.some((l) => l.isRemote);
  const pref = profile.preferences.remotePreference;

  if (isRemote) {
    if (pref === 'REMOTE' || pref === 'ANY') return base(100, 'Remote role matches your work-mode preference.');
    return base(80, 'This role is remote.');
  }
  if (pref === 'REMOTE') {
    return base(40, 'You prefer remote work; this role is on-site.');
  }

  const cities = opportunity.locations.map((l) => l.city?.toLowerCase()).filter(Boolean) as string[];
  const states = opportunity.locations.map((l) => l.state?.toLowerCase()).filter(Boolean) as string[];
  const preferred = profile.preferences.preferredLocations.map((l) => l.toLowerCase());

  if (cities.length === 0) return base(70, 'This posting does not publish a location.');
  if (profile.city && cities.includes(profile.city.toLowerCase())) {
    return base(100, `Located in your city (${profile.city}).`);
  }
  if (preferred.some((p) => cities.includes(p))) {
    return base(95, 'Matches one of your preferred locations.');
  }
  if (profile.state && states.includes(profile.state.toLowerCase())) {
    return base(85, `Within your state (${profile.state}).`);
  }
  if (opportunity.workMode === 'HYBRID') {
    return base(profile.preferences.willingToRelocate ? 70 : 45, 'Hybrid role in another city.');
  }
  return base(profile.preferences.willingToRelocate ? 65 : 30, `Located in ${cities.join(', ')}.`);
}

function scorePreferences(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): MatchComponentDto {
  const base = (score: number, explanation: string): MatchComponentDto => ({
    key: 'preferences',
    label: LABELS.preferences,
    score,
    weight: WEIGHTS.preferences,
    explanation,
  });

  const prefs = profile.preferences;
  const notes: string[] = [];
  let score = 70;

  // Internship vs full-time.
  const isInternship = INTERNSHIP_TYPES.includes(opportunity.opportunityType);
  if (prefs.opportunityPreference === 'INTERNSHIP') {
    score += isInternship ? 12 : -25;
    notes.push(isInternship ? 'internship as preferred' : 'you prefer internships');
  } else if (prefs.opportunityPreference === 'FULL_TIME') {
    score += isInternship ? -25 : 12;
    notes.push(isInternship ? 'you prefer full-time roles' : 'full-time as preferred');
  }

  // Government vs private.
  const isGov = GOVERNMENT_TYPES.includes(opportunity.opportunityType) || PSU_TYPES.includes(opportunity.opportunityType);
  if (prefs.sectorPreference === 'GOVERNMENT') {
    score += isGov ? 15 : -20;
    notes.push(isGov ? 'government sector as preferred' : 'you prefer government roles');
  } else if (prefs.sectorPreference === 'PRIVATE') {
    score += isGov ? -20 : 10;
    notes.push(isGov ? 'you prefer private-sector roles' : 'private sector as preferred');
  }

  // Desired role keyword overlap.
  if (prefs.desiredRoles.length) {
    const haystack = `${opportunity.title} ${opportunity.role ?? ''}`.toLowerCase();
    const hit = prefs.desiredRoles.find((r) => haystack.includes(r.toLowerCase()));
    if (hit) {
      score += 15;
      notes.push(`matches your target role "${hit}"`);
    }
  }

  // Desired industry.
  if (prefs.desiredIndustries.length && opportunity.industryName) {
    const hit = prefs.desiredIndustries.find(
      (i) => i.toLowerCase() === opportunity.industryName!.toLowerCase(),
    );
    if (hit) {
      score += 10;
      notes.push(`in your target industry (${hit})`);
    }
  }

  // Salary expectation — only penalises when the posting publishes a figure.
  if (prefs.minSalaryExpectation != null && opportunity.salaryMax != null) {
    if (opportunity.salaryMax < prefs.minSalaryExpectation) {
      score -= 15;
      notes.push('below your salary expectation');
    } else {
      score += 5;
      notes.push('meets your salary expectation');
    }
  }

  score = Math.max(0, Math.min(100, score));
  return base(score, notes.length ? notes.join(', ') : 'No strong preference signals.');
}

export function computeMatch(
  profile: ProfileSnapshot,
  opportunity: OpportunitySnapshot,
  now: Date = new Date(),
): MatchScoreDto & { eligibilityVerdict: string } {
  const eligibility = evaluateEligibility(profile, opportunity, now);
  const skills = scoreSkills(profile, opportunity);

  const components: MatchComponentDto[] = [
    {
      key: 'eligibility',
      label: LABELS.eligibility,
      score: eligibility.score,
      weight: WEIGHTS.eligibility,
      explanation:
        eligibility.verdict === 'ELIGIBLE'
          ? `You meet all ${eligibility.passed.length} published criteria.`
          : eligibility.verdict === 'NEEDS_REVIEW'
            ? `${eligibility.unknown.length} criterion/criteria could not be confirmed.`
            : eligibility.failed[0]?.message ?? 'You do not meet the published criteria.',
    },
    {
      key: 'skills',
      label: LABELS.skills,
      score: skills.score,
      weight: WEIGHTS.skills,
      explanation: skills.explanation,
    },
    scoreEducation(profile, opportunity),
    scoreExperience(profile, opportunity),
    scoreLocation(profile, opportunity),
    scorePreferences(profile, opportunity),
  ];

  const weighted = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  let overall = Math.round(weighted);

  // Hard gates. A clearly ineligible opportunity can never rank as a strong
  // match, no matter how well the skills line up.
  if (eligibility.verdict === 'NOT_ELIGIBLE') {
    overall = Math.min(overall, 35);
  } else if (eligibility.verdict === 'NEEDS_REVIEW') {
    overall = Math.min(overall, 82);
  }

  // An expired posting is never recommended.
  if (opportunity.applicationDeadline && opportunity.applicationDeadline < now) {
    overall = Math.min(overall, 20);
  }

  return {
    overall: Math.max(0, Math.min(100, overall)),
    components,
    matchedSkills: skills.matched,
    missingSkills: skills.missing,
    computedAt: now.toISOString(),
    eligibilityVerdict: eligibility.verdict,
  };
}

export { WEIGHTS as MATCH_WEIGHTS };

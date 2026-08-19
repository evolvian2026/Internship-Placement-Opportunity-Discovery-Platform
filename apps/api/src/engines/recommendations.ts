import { SKILL_BY_NAME, type CareerRecommendationDto } from '@odp/shared';
import type { OpportunitySnapshot, ProfileSnapshot } from './types';

/**
 * Career recommendations (requirement 28).
 *
 * Rule-based and grounded in the actual opportunity catalogue: roles are
 * suggested because live postings match the user's skills, not because a model
 * imagined them. The shape is designed so a collaborative-filtering or
 * embedding-based ranker can replace `scoreRoles` later without touching
 * callers (requirement 43).
 */

export interface RecommendationInputs {
  profile: ProfileSnapshot;
  /** Live opportunities used as the evidence base. */
  opportunities: OpportunitySnapshot[];
  /** Precomputed match scores keyed by opportunity id, when available. */
  matchScores?: Map<string, number>;
}

interface RoleAggregate {
  name: string;
  count: number;
  skillOverlap: number;
  totalSkills: number;
  bestMatch: number;
}

function roleKeyFor(opportunity: OpportunitySnapshot): string {
  // Prefer the explicit role; otherwise normalise the title into a role-ish
  // label by dropping seniority and hiring-noise words.
  const base = opportunity.role ?? opportunity.title;
  return base
    .replace(/\b(senior|junior|jr|sr|lead|principal|staff|associate|trainee|intern(ship)?|fresher|graduate)\b/gi, '')
    .replace(/[-—–|(].*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function recommendRoles(
  profile: ProfileSnapshot,
  opportunities: OpportunitySnapshot[],
  matchScores?: Map<string, number>,
): { name: string; score: number; reason: string }[] {
  const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  const roles = new Map<string, RoleAggregate>();

  for (const opportunity of opportunities) {
    const key = roleKeyFor(opportunity);
    if (!key || key.length < 3) continue;

    const overlap = opportunity.skills.filter((s) => userSkills.has(s.name.toLowerCase())).length;
    const entry = roles.get(key) ?? {
      name: key,
      count: 0,
      skillOverlap: 0,
      totalSkills: 0,
      bestMatch: 0,
    };

    entry.count += 1;
    entry.skillOverlap += overlap;
    entry.totalSkills += opportunity.skills.length;
    entry.bestMatch = Math.max(entry.bestMatch, matchScores?.get(opportunity.id) ?? 0);
    roles.set(key, entry);
  }

  const desired = profile.preferences.desiredRoles.map((r) => r.toLowerCase());

  return [...roles.values()]
    .filter((role) => role.count >= 2 || role.skillOverlap > 0)
    .map((role) => {
      const coverage = role.totalSkills === 0 ? 0 : role.skillOverlap / role.totalSkills;
      // Blend skill fit, market volume and any computed match score.
      const volumeSignal = Math.min(1, role.count / 10);
      const stated = desired.some((d) => role.name.toLowerCase().includes(d)) ? 0.15 : 0;
      const score = Math.round(
        Math.min(100, (coverage * 55 + volumeSignal * 20 + (role.bestMatch / 100) * 25 + stated * 100)),
      );

      return {
        name: role.name,
        score,
        reason:
          coverage > 0.5
            ? `Your skills cover ${Math.round(coverage * 100)}% of what these ${role.count} openings ask for.`
            : `${role.count} live opening${role.count === 1 ? '' : 's'} in this role match parts of your profile.`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function recommendSkills(
  profile: ProfileSnapshot,
  opportunities: OpportunitySnapshot[],
): { name: string; reason: string }[] {
  const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  const demand = new Map<string, number>();

  for (const opportunity of opportunities) {
    for (const skill of opportunity.skills) {
      if (userSkills.has(skill.name.toLowerCase())) continue;
      demand.set(skill.name, (demand.get(skill.name) ?? 0) + 1);
    }
  }

  // A skill adjacent to something the user already has is easier to pick up,
  // so it is surfaced ahead of an equally-demanded unrelated skill.
  const adjacency = new Set<string>();
  for (const skill of profile.skills) {
    for (const related of SKILL_BY_NAME.get(skill)?.related ?? []) adjacency.add(related);
  }

  return [...demand.entries()]
    .map(([name, count]) => ({
      name,
      count,
      boost: adjacency.has(name) ? 1.5 : 1,
    }))
    .sort((a, b) => b.count * b.boost - a.count * a.boost)
    .slice(0, 6)
    .map((entry) => ({
      name: entry.name,
      reason: adjacency.has(entry.name)
        ? `Builds on skills you already have · asked for in ${entry.count} matching opportunities`
        : `Asked for in ${entry.count} of the opportunities matching your profile`,
    }));
}

export function recommendIndustries(
  opportunities: OpportunitySnapshot[],
  matchScores?: Map<string, number>,
): { name: string; score: number }[] {
  const byIndustry = new Map<string, { total: number; count: number }>();

  for (const opportunity of opportunities) {
    if (!opportunity.industryName) continue;
    const entry = byIndustry.get(opportunity.industryName) ?? { total: 0, count: 0 };
    entry.total += matchScores?.get(opportunity.id) ?? 50;
    entry.count += 1;
    byIndustry.set(opportunity.industryName, entry);
  }

  return [...byIndustry.entries()]
    .map(([name, entry]) => ({ name, score: Math.round(entry.total / entry.count) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Certification suggestions derived from the demanded-skill categories. */
export function recommendCertifications(
  missingSkills: string[],
): { name: string; reason: string }[] {
  const MAP: Record<string, string> = {
    AWS: 'AWS Certified Cloud Practitioner',
    Azure: 'Microsoft Azure Fundamentals (AZ-900)',
    'Google Cloud': 'Google Cloud Digital Leader',
    Kubernetes: 'Certified Kubernetes Application Developer (CKAD)',
    'Power BI': 'Microsoft Power BI Data Analyst (PL-300)',
    Tableau: 'Tableau Desktop Specialist',
    'Machine Learning': 'A recognised applied machine-learning specialisation',
    SQL: 'A database fundamentals certification',
    Cybersecurity: 'CompTIA Security+',
    Networking: 'Cisco CCNA',
    'Digital Marketing': 'Google Digital Marketing & E-commerce certificate',
    'Six Sigma': 'Lean Six Sigma Green Belt',
    Agile: 'Professional Scrum Master I',
    'Product Management': 'A product-management foundations certificate',
    Excel: 'Microsoft Excel Associate (MO-200)',
  };

  const out: { name: string; reason: string }[] = [];
  for (const skill of missingSkills) {
    const cert = MAP[skill];
    if (cert && !out.some((c) => c.name === cert)) {
      out.push({ name: cert, reason: `Validates ${skill}, which appears in your matched opportunities.` });
    }
    if (out.length >= 4) break;
  }
  return out;
}

/** Project suggestions that would close the highest-demand gaps. */
export function recommendProjects(
  missingSkills: string[],
  topRole: string | undefined,
): { name: string; reason: string }[] {
  if (missingSkills.length === 0) return [];

  const primary = missingSkills.slice(0, 3);
  const out: { name: string; reason: string }[] = [];

  if (primary.includes('Power BI') || primary.includes('Tableau')) {
    out.push({
      name: 'Build an end-to-end analytics dashboard on a public dataset',
      reason: 'Demonstrates the BI tooling your target roles ask for.',
    });
  }
  if (primary.some((s) => ['Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch'].includes(s))) {
    out.push({
      name: 'Train and deploy a model behind a small API',
      reason: 'Shows applied ML beyond notebook experiments.',
    });
  }
  if (primary.some((s) => ['React', 'Node.js', 'Next.js', 'TypeScript'].includes(s))) {
    out.push({
      name: 'Ship a full-stack web app with authentication and a database',
      reason: 'Covers the web stack these openings list.',
    });
  }
  if (primary.some((s) => ['Docker', 'Kubernetes', 'CI/CD', 'AWS'].includes(s))) {
    out.push({
      name: 'Containerise a project and add a CI/CD pipeline',
      reason: 'Evidence of the deployment skills employers ask for.',
    });
  }

  if (out.length === 0) {
    out.push({
      name: `A portfolio project using ${primary.join(', ')}`,
      reason: topRole
        ? `Closes the biggest gap for ${topRole} roles.`
        : 'Closes the most-requested gaps in your matched opportunities.',
    });
  }

  return out.slice(0, 3);
}

export function buildRecommendations(
  inputs: RecommendationInputs,
): Omit<CareerRecommendationDto, 'companies'> {
  const { profile, opportunities, matchScores } = inputs;

  const roles = recommendRoles(profile, opportunities, matchScores);
  const skills = recommendSkills(profile, opportunities);
  const industries = recommendIndustries(opportunities, matchScores);
  const missing = skills.map((s) => s.name);

  return {
    roles,
    skills,
    industries,
    certifications: recommendCertifications(missing),
    projects: recommendProjects(missing, roles[0]?.name),
  };
}

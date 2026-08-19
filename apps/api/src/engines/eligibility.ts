import {
  DEGREE_EQUIVALENCE,
  DEGREE_LABELS,
  GOVERNMENT_TYPES,
  POSTGRADUATE_DEGREES,
  type Degree,
  type EligibilityCheckDto,
  type EligibilitySummaryDto,
  type EligibilityVerdict,
} from '@odp/shared';
import type { OpportunitySnapshot, ProfileSnapshot } from './types';

/**
 * Eligibility engine.
 *
 * Rules that shape every decision here:
 *  1. A criterion the posting does not state is *not* a failure — it is simply
 *     not checked.
 *  2. A criterion the posting states but the profile cannot answer produces an
 *     `unknown` check, which downgrades the verdict to NEEDS_REVIEW.
 *     The user is never silently marked eligible.
 *  3. Only hard, officially-published criteria can produce NOT_ELIGIBLE.
 *     Soft signals (location preference) become warnings.
 */

const check = (
  key: string,
  label: string,
  passed: boolean | null,
  message: string,
): EligibilityCheckDto => ({ key, label, passed, message });

/** Does the user's degree satisfy one of the accepted degrees? */
export function degreeSatisfies(userDegree: Degree, accepted: Degree[]): boolean {
  if (accepted.includes(userDegree)) return true;

  // Officially interchangeable degrees (B.Tech ≡ B.E., MBA ≡ PGDM, ...).
  for (const group of DEGREE_EQUIVALENCE) {
    if (group.includes(userDegree) && group.some((d) => accepted.includes(d))) return true;
  }

  // A postgraduate degree satisfies a posting that only lists undergraduate
  // degrees *of the same stream* is NOT assumed — that varies by employer, so
  // it stays a non-match rather than a guess.
  return false;
}

function normalizeBranch(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Common branch synonyms seen across Indian postings. */
const BRANCH_ALIASES: Record<string, string[]> = {
  cse: ['computer science', 'computer science and engineering', 'cs', 'computer engineering'],
  it: ['information technology'],
  ece: ['electronics and communication', 'electronics communication', 'electronics & communication'],
  eee: ['electrical and electronics', 'electrical electronics'],
  ee: ['electrical', 'electrical engineering'],
  me: ['mechanical', 'mechanical engineering'],
  ce: ['civil', 'civil engineering'],
  che: ['chemical', 'chemical engineering'],
  ai: ['artificial intelligence', 'ai and ml', 'aiml', 'artificial intelligence and machine learning'],
  ds: ['data science'],
};

export function branchSatisfies(userBranch: string, accepted: string[]): boolean {
  const user = normalizeBranch(userBranch);
  const acceptedNorm = accepted.map(normalizeBranch);

  // Postings frequently say "All Branches" / "Any Discipline".
  if (acceptedNorm.some((a) => /^(all|any)\b/.test(a))) return true;
  if (acceptedNorm.includes(user)) return true;

  const expand = (value: string): string[] => {
    const out = [value];
    for (const [code, names] of Object.entries(BRANCH_ALIASES)) {
      if (value === code || names.includes(value)) out.push(code, ...names);
    }
    return out;
  };

  const userForms = new Set(expand(user));
  for (const a of acceptedNorm) {
    for (const form of expand(a)) {
      if (userForms.has(form)) return true;
      // Substring match handles "computer science" ⊂ "computer science and engineering".
      if (form.length > 4 && (user.includes(form) || form.includes(user))) return true;
    }
  }
  return false;
}

function ageOn(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const monthDiff = at.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age;
}

function bestEducation(profile: ProfileSnapshot) {
  if (profile.education.length === 0) return null;
  return profile.education.find((e) => e.isPrimary) ?? profile.education[0];
}

export function evaluateEligibility(
  profile: ProfileSnapshot,
  opportunity: OpportunitySnapshot,
  now: Date = new Date(),
): EligibilitySummaryDto {
  const passed: EligibilityCheckDto[] = [];
  const failed: EligibilityCheckDto[] = [];
  const warnings: EligibilityCheckDto[] = [];
  const unknown: EligibilityCheckDto[] = [];

  const criteria = opportunity.eligibility;
  const education = bestEducation(profile);

  /* ---------------- Degree ---------------- */
  if (criteria?.degrees.length) {
    const accepted = criteria.degrees.map((d) => DEGREE_LABELS[d]).join(', ');
    if (!education) {
      unknown.push(
        check('degree', 'Degree', null, `Posting accepts ${accepted}. Add your education to check this.`),
      );
    } else if (profile.education.some((e) => degreeSatisfies(e.degree, criteria.degrees))) {
      const matched = profile.education.find((e) => degreeSatisfies(e.degree, criteria.degrees))!;
      passed.push(check('degree', 'Degree', true, `${DEGREE_LABELS[matched.degree]} accepted`));
    } else {
      failed.push(
        check(
          'degree',
          'Degree',
          false,
          `This posting accepts ${accepted}; your qualification is ${DEGREE_LABELS[education.degree]}.`,
        ),
      );
    }
  }

  /* ---------------- Branch ---------------- */
  if (criteria?.branches.length) {
    const accepted = criteria.branches.join(', ');
    const userBranches = profile.education.map((e) => e.branch).filter((b): b is string => Boolean(b));
    if (userBranches.length === 0) {
      unknown.push(
        check('branch', 'Branch', null, `Posting accepts ${accepted}. Add your branch to check this.`),
      );
    } else if (userBranches.some((b) => branchSatisfies(b, criteria.branches))) {
      const matched = userBranches.find((b) => branchSatisfies(b, criteria.branches))!;
      passed.push(check('branch', 'Branch', true, `${matched} accepted`));
    } else {
      failed.push(
        check('branch', 'Branch', false, `This posting accepts ${accepted}; your branch is ${userBranches[0]}.`),
      );
    }
  }

  /* ---------------- Graduation year ---------------- */
  if (criteria?.graduationYears.length) {
    const accepted = criteria.graduationYears.join(', ');
    const years = profile.education.map((e) => e.graduationYear).filter((y): y is number => y != null);
    if (years.length === 0) {
      unknown.push(
        check('graduationYear', 'Graduation Year', null, `Posting is for the ${accepted} batch. Add your graduation year.`),
      );
    } else if (years.some((y) => criteria.graduationYears.includes(y))) {
      const matched = years.find((y) => criteria.graduationYears.includes(y))!;
      passed.push(check('graduationYear', 'Graduation Year', true, `${matched} graduation accepted`));
    } else {
      failed.push(
        check(
          'graduationYear',
          'Graduation Year',
          false,
          `This posting is for the ${accepted} batch; you graduate in ${years[0]}.`,
        ),
      );
    }
  }

  /* ---------------- CGPA / percentage ---------------- */
  if (criteria?.minCgpa != null) {
    const cgpas = profile.education.map((e) => e.cgpa).filter((c): c is number => c != null);
    const percentages = profile.education.map((e) => e.percentage).filter((p): p is number => p != null);

    if (cgpas.length > 0) {
      const best = Math.max(...cgpas);
      if (best >= criteria.minCgpa) {
        passed.push(check('cgpa', 'CGPA', true, `CGPA requirement satisfied (${best} ≥ ${criteria.minCgpa})`));
      } else {
        failed.push(
          check('cgpa', 'CGPA', false, `Requires a minimum CGPA of ${criteria.minCgpa}; your CGPA is ${best}.`),
        );
      }
    } else if (percentages.length > 0) {
      // Approximate conversion is *not* used to fail anyone — it can only pass.
      const best = Math.max(...percentages);
      const approxCgpa = best / 9.5;
      if (approxCgpa >= criteria.minCgpa) {
        passed.push(
          check('cgpa', 'CGPA', true, `${best}% satisfies the minimum CGPA of ${criteria.minCgpa}`),
        );
      } else {
        unknown.push(
          check(
            'cgpa',
            'CGPA',
            null,
            `Requires a minimum CGPA of ${criteria.minCgpa}. You recorded ${best}% — add your CGPA for an exact check.`,
          ),
        );
      }
    } else {
      unknown.push(
        check('cgpa', 'CGPA', null, `Requires a minimum CGPA of ${criteria.minCgpa}. Add your CGPA to check this.`),
      );
    }
  }

  if (criteria?.minPercentage != null) {
    const percentages = profile.education.map((e) => e.percentage).filter((p): p is number => p != null);
    if (percentages.length === 0) {
      unknown.push(
        check(
          'percentage',
          'Percentage',
          null,
          `Requires a minimum of ${criteria.minPercentage}%. Add your percentage to check this.`,
        ),
      );
    } else {
      const best = Math.max(...percentages);
      if (best >= criteria.minPercentage) {
        passed.push(check('percentage', 'Percentage', true, `${best}% meets the ${criteria.minPercentage}% requirement`));
      } else {
        failed.push(
          check('percentage', 'Percentage', false, `Requires ${criteria.minPercentage}%; you recorded ${best}%.`),
        );
      }
    }
  }

  /* ---------------- Backlogs ---------------- */
  if (criteria?.maxBacklogs != null) {
    const backlogs = profile.education.map((e) => e.backlogs).filter((b): b is number => b != null);
    if (backlogs.length === 0) {
      unknown.push(
        check(
          'backlogs',
          'Backlogs',
          null,
          `Allows at most ${criteria.maxBacklogs} backlog(s). Add your backlog count to check this.`,
        ),
      );
    } else {
      const worst = Math.max(...backlogs);
      if (worst <= criteria.maxBacklogs) {
        passed.push(
          check(
            'backlogs',
            'Backlogs',
            true,
            criteria.maxBacklogs === 0 ? 'No active backlogs' : `${worst} backlog(s) within the allowed limit`,
          ),
        );
      } else {
        failed.push(
          check('backlogs', 'Backlogs', false, `Allows at most ${criteria.maxBacklogs}; you have ${worst}.`),
        );
      }
    }
  }

  /* ---------------- Experience ---------------- */
  const minExp = criteria?.minExperienceYears ?? null;
  const maxExp = criteria?.maxExperienceYears ?? null;
  if (minExp != null || maxExp != null) {
    const years = profile.yearsOfExperience;
    const meetsMin = minExp == null || years >= minExp;
    const meetsMax = maxExp == null || years <= maxExp;

    if (meetsMin && meetsMax) {
      const label =
        minExp === 0 && (maxExp === 0 || maxExp === null)
          ? 'Fresher eligible'
          : `Experience requirement satisfied (${years} year(s))`;
      passed.push(check('experience', 'Experience', true, label));
    } else if (!meetsMin) {
      failed.push(
        check('experience', 'Experience', false, `Requires at least ${minExp} year(s); you have ${years}.`),
      );
    } else {
      // Over-qualified is a caution, not a hard rejection — many employers still consider.
      warnings.push(
        check(
          'experience',
          'Experience',
          false,
          `This role targets up to ${maxExp} year(s) of experience; you have ${years}.`,
        ),
      );
    }
  }

  /* ---------------- Age ---------------- */
  if (criteria?.minAge != null || criteria?.maxAge != null) {
    if (!profile.dateOfBirth) {
      unknown.push(
        check(
          'age',
          'Age',
          null,
          `Age limit applies (${criteria.minAge ?? 'any'}–${criteria.maxAge ?? 'any'}). Add your date of birth to check this.`,
        ),
      );
    } else {
      const age = ageOn(profile.dateOfBirth, now);
      const okMin = criteria.minAge == null || age >= criteria.minAge;
      const okMax = criteria.maxAge == null || age <= criteria.maxAge;
      if (okMin && okMax) {
        passed.push(check('age', 'Age', true, `Age ${age} is within the permitted range`));
      } else {
        failed.push(
          check(
            'age',
            'Age',
            false,
            `Age limit is ${criteria.minAge ?? 'any'}–${criteria.maxAge ?? 'any'}; you are ${age}.`,
          ),
        );
      }
    }
  }

  /* ---------------- Citizenship (government postings) ---------------- */
  if (criteria?.citizenship) {
    const required = criteria.citizenship.toLowerCase();
    if (!profile.country) {
      unknown.push(
        check('citizenship', 'Citizenship', null, `Requires ${criteria.citizenship} citizenship. Add your country to check this.`),
      );
    } else if (profile.country.toLowerCase().includes(required) || required.includes(profile.country.toLowerCase())) {
      passed.push(check('citizenship', 'Citizenship', true, `${criteria.citizenship} citizenship requirement noted`));
    } else {
      // Country of residence is not proof of citizenship — never a hard fail.
      unknown.push(
        check(
          'citizenship',
          'Citizenship',
          null,
          `This posting requires ${criteria.citizenship} citizenship. Confirm this on the official notification.`,
        ),
      );
    }
  } else if (GOVERNMENT_TYPES.includes(opportunity.opportunityType)) {
    warnings.push(
      check(
        'citizenship',
        'Citizenship',
        null,
        'Government postings usually carry citizenship conditions. Check the official notification.',
      ),
    );
  }

  /* ---------------- Work authorization ---------------- */
  if (criteria?.workAuthorization) {
    unknown.push(
      check(
        'workAuthorization',
        'Work Authorization',
        null,
        `Requires: ${criteria.workAuthorization}. Confirm on the official posting.`,
      ),
    );
  }

  /* ---------------- Gender (only when officially specified) ---------------- */
  if (criteria?.genderRequirement) {
    warnings.push(
      check(
        'gender',
        'Gender',
        null,
        `The official notification specifies: ${criteria.genderRequirement}.`,
      ),
    );
  }

  /* ---------------- Location (soft) ---------------- */
  const isRemote = opportunity.workMode === 'REMOTE' || opportunity.locations.some((l) => l.isRemote);
  if (!isRemote && opportunity.locations.length > 0 && profile.city) {
    const cities = opportunity.locations.map((l) => l.city).filter((c): c is string => Boolean(c));
    const sameCity = cities.some((c) => c.toLowerCase() === profile.city!.toLowerCase());
    if (sameCity) {
      passed.push(check('location', 'Location', true, `Located in ${profile.city}`));
    } else if (cities.length > 0 && !profile.preferences.willingToRelocate) {
      warnings.push(
        check('location', 'Location', false, `Location preference: ${cities.join(', ')}`),
      );
    } else if (cities.length > 0) {
      warnings.push(check('location', 'Location', null, `Location preference: ${cities.join(', ')}`));
    }
  }

  /* ---------------- Verdict ---------------- */

  // Location is a soft signal, not a published criterion: a posting that
  // states no criteria must never read as a confident "Eligible" just because
  // the city happens to match.
  const publishesCriteria = Boolean(
    criteria &&
      (criteria.degrees.length > 0 ||
        criteria.branches.length > 0 ||
        criteria.graduationYears.length > 0 ||
        criteria.minCgpa != null ||
        criteria.minPercentage != null ||
        criteria.maxBacklogs != null ||
        criteria.minExperienceYears != null ||
        criteria.maxExperienceYears != null ||
        criteria.minAge != null ||
        criteria.maxAge != null ||
        criteria.citizenship != null ||
        criteria.workAuthorization != null),
  );

  let verdict: EligibilityVerdict;
  if (failed.length > 0) {
    verdict = 'NOT_ELIGIBLE';
  } else if (!publishesCriteria) {
    verdict = 'NEEDS_REVIEW';
    unknown.push(
      check(
        'criteria',
        'Eligibility',
        null,
        'This posting does not publish structured eligibility criteria. Check the official source before applying.',
      ),
    );
  } else if (unknown.length > 0) {
    verdict = 'NEEDS_REVIEW';
  } else {
    verdict = 'ELIGIBLE';
  }

  // Score is used by the matching engine as a hard gate, not as a soft signal.
  const total = passed.length + failed.length + unknown.length;
  let score: number;
  if (verdict === 'NOT_ELIGIBLE') {
    score = total === 0 ? 0 : Math.round((passed.length / total) * 40);
  } else if (verdict === 'NEEDS_REVIEW') {
    score = total === 0 ? 60 : Math.round(60 + (passed.length / total) * 25);
  } else {
    score = 100;
  }

  return { verdict, score, passed, failed, warnings, unknown };
}

/** Convenience predicate used by the "eligible only" filter. */
export function isEligible(summary: EligibilitySummaryDto): boolean {
  return summary.verdict === 'ELIGIBLE';
}

export { POSTGRADUATE_DEGREES };

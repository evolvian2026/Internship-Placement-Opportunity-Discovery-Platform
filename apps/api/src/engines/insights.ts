import type {
  EligibilitySummaryDto,
  NearMissGroupDto,
  ProfileFieldKey,
  ProfileUnlockDto,
} from '@odp/shared';

/**
 * Insight engines.
 *
 * Both turn the eligibility engine's own output into something the student can
 * act on, and neither needs any data the platform does not already hold:
 *
 *  - `collectUnlocks`   — one missing profile field routinely blocks a *lot* of
 *                         opportunities. Rather than nagging for a "complete
 *                         profile", ask for exactly the field that unblocks the
 *                         most, and say what it unblocks.
 *  - `collectNearMisses`— "not eligible" is a dead end; "you miss this by 0.2
 *                         CGPA" is a plan. Groups rejections by the criterion
 *                         that caused them and by how close the candidate is.
 */

/* ------------------------------------------------------------------ *
 * 1. Profile unlocks
 * ------------------------------------------------------------------ */

interface FieldDescriptor {
  label: string;
  prompt: string;
  detail: string;
  href: string;
}

const FIELD_DESCRIPTORS: Record<ProfileFieldKey, FieldDescriptor> = {
  'education.degree': {
    label: 'Degree',
    prompt: 'Add your degree',
    detail: 'Most postings state which degrees they accept — without yours we cannot say whether you qualify.',
    href: '/profile#education',
  },
  'education.branch': {
    label: 'Branch',
    prompt: 'Add your branch or specialisation',
    detail: 'Engineering and PSU postings are usually restricted to specific branches.',
    href: '/profile#education',
  },
  'education.graduationYear': {
    label: 'Graduation year',
    prompt: 'Add your graduation year',
    detail: 'Off-campus drives are almost always limited to one or two batches.',
    href: '/profile#education',
  },
  'education.cgpa': {
    label: 'CGPA',
    prompt: 'Add your CGPA',
    detail: 'A published CGPA cut-off is the single most common eligibility criterion.',
    href: '/profile#education',
  },
  'education.percentage': {
    label: 'Percentage',
    prompt: 'Add your aggregate percentage',
    detail:
      'Some postings state the cut-off as a percentage rather than a CGPA. We will not convert between the two on your behalf, because every university converts differently.',
    href: '/profile#education',
  },
  'education.backlogs': {
    label: 'Backlogs',
    prompt: 'Confirm your active backlog count',
    detail: 'Many drives require zero active backlogs at the time of joining. Enter 0 if you have none.',
    href: '/profile#education',
  },
  'profile.dateOfBirth': {
    label: 'Date of birth',
    prompt: 'Add your date of birth',
    detail: 'Government and PSU recruitment enforces an age limit on the closing date.',
    href: '/profile#basics',
  },
  'profile.country': {
    label: 'Country',
    prompt: 'Add your country',
    detail: 'Government postings usually carry a citizenship condition.',
    href: '/profile#basics',
  },
  'profile.yearsOfExperience': {
    label: 'Years of experience',
    prompt: 'Confirm your years of experience',
    detail: 'Enter 0 if you are a fresher — that is itself an eligibility criterion.',
    href: '/profile#basics',
  },
};

export interface UnlockInput {
  opportunityId: string;
  slug: string;
  title: string;
  organizationName: string;
  eligibility: EligibilitySummaryDto;
}

/**
 * Aggregates the engine's `unknown` checks into "add this one thing" prompts,
 * ordered by how many opportunities each would resolve.
 */
export function collectUnlocks(inputs: UnlockInput[]): {
  unresolvedCount: number;
  examinedCount: number;
  unlocks: ProfileUnlockDto[];
} {
  const byField = new Map<ProfileFieldKey, UnlockInput[]>();

  for (const input of inputs) {
    if (input.eligibility.verdict !== 'NEEDS_REVIEW') continue;

    // One opportunity can be blocked on several fields; it counts towards each,
    // because filling any one of them narrows the uncertainty.
    const fields = new Set<ProfileFieldKey>();
    for (const unknown of input.eligibility.unknown) {
      if (unknown.resolvedBy) fields.add(unknown.resolvedBy);
    }
    for (const field of fields) {
      byField.set(field, [...(byField.get(field) ?? []), input]);
    }
  }

  const unlocks: ProfileUnlockDto[] = [...byField.entries()]
    .map(([field, blocked]) => {
      const descriptor = FIELD_DESCRIPTORS[field];
      return {
        field,
        label: descriptor.label,
        prompt: descriptor.prompt,
        detail: descriptor.detail,
        blockedCount: blocked.length,
        href: descriptor.href,
        examples: blocked.slice(0, 3).map((b) => ({
          id: b.opportunityId,
          slug: b.slug,
          title: b.title,
          organizationName: b.organizationName,
        })),
      };
    })
    .sort((a, b) => b.blockedCount - a.blockedCount);

  return {
    unresolvedCount: inputs.filter((i) => i.eligibility.verdict === 'NEEDS_REVIEW').length,
    examinedCount: inputs.length,
    unlocks,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Near misses
 * ------------------------------------------------------------------ */

export interface NearMissInput<T> {
  opportunity: T;
  eligibility: EligibilitySummaryDto;
}

/** How close a gap has to be to count as "near", per unit. */
const NEAR_THRESHOLDS: Record<string, number> = {
  CGPA: 1.0,
  '%': 10,
  backlogs: 2,
  years: 1,
};

const GROUP_TITLES: Record<string, string> = {
  cgpa: 'Just short on CGPA',
  percentage: 'Just short on percentage',
  backlogs: 'Blocked by active backlogs',
  experience: 'Just short on experience',
  graduationYear: 'Wrong batch — worth saving for later',
  degree: 'Open to a different qualification',
  branch: 'Open to a different branch',
  age: 'Outside the published age limit',
};

/**
 * Groups ineligible opportunities by the criterion that blocked them, keeping
 * only those the candidate is close to meeting.
 */
export function collectNearMisses<T>(
  inputs: NearMissInput<T>[],
  opts: { maxPerGroup?: number } = {},
): {
  examinedCount: number;
  ineligibleCount: number;
  groups: (Omit<NearMissGroupDto, 'items'> & { items: { opportunity: T; reason: string; gap: NonNullable<import('@odp/shared').EligibilityCheckDto['gap']> }[] })[];
} {
  const maxPerGroup = opts.maxPerGroup ?? 10;
  const grouped = new Map<string, { opportunity: T; reason: string; gap: NonNullable<import('@odp/shared').EligibilityCheckDto['gap']>; shortfall: number }[]>();

  for (const input of inputs) {
    if (input.eligibility.verdict !== 'NOT_ELIGIBLE') continue;

    // Only the *first* failed check matters: fixing a second criterion is
    // pointless while the first still blocks.
    const blocking = input.eligibility.failed.find((f) => f.gap);
    if (!blocking?.gap) continue;

    const { gap } = blocking;
    const threshold = gap.unit ? NEAR_THRESHOLDS[gap.unit] : undefined;

    // A categorical gap (degree, branch) has no distance; include it so the
    // student learns the posting exists, but it can never be "nearly" met.
    if (gap.shortfall != null && threshold != null && gap.shortfall > threshold) continue;

    grouped.set(blocking.key, [
      ...(grouped.get(blocking.key) ?? []),
      { opportunity: input.opportunity, reason: blocking.message, gap, shortfall: gap.shortfall ?? Number.MAX_SAFE_INTEGER },
    ]);
  }

  const groups = [...grouped.entries()]
    .map(([key, items]) => {
      const sorted = items.sort((a, b) => a.shortfall - b.shortfall);
      const closable = sorted.some((i) => i.gap.closable);
      const smallest = sorted[0];

      return {
        key,
        title: GROUP_TITLES[key] ?? `Blocked by ${key}`,
        advice: buildAdvice(key, sorted.length, smallest.gap, sorted[sorted.length - 1].gap),
        closable,
        items: sorted.slice(0, maxPerGroup).map(({ opportunity, reason, gap }) => ({ opportunity, reason, gap })),
      };
    })
    // Closable gaps first — those are the ones worth acting on.
    .sort((a, b) => Number(b.closable) - Number(a.closable) || b.items.length - a.items.length);

  return {
    examinedCount: inputs.length,
    ineligibleCount: inputs.filter((i) => i.eligibility.verdict === 'NOT_ELIGIBLE').length,
    groups,
  };
}

function buildAdvice(
  key: string,
  count: number,
  /** The closest opportunity in the group. */
  nearest: NonNullable<import('@odp/shared').EligibilityCheckDto['gap']>,
  /** The furthest one still inside the "near" threshold. */
  furthest: NonNullable<import('@odp/shared').EligibilityCheckDto['gap']>,
): string {
  const plural = count === 1 ? 'opportunity' : 'opportunities';

  // The nearest and the furthest in a group usually ask for different cut-offs,
  // so quoting only the nearest would overstate what reaching it unlocks.
  const spansOneCutOff = nearest.required === furthest.required;

  switch (key) {
    case 'cgpa':
    case 'percentage': {
      const unit = key === 'cgpa' ? '' : '%';
      if (spansOneCutOff) {
        return `Reaching ${nearest.required} would open ${count} more ${plural}. You are ${nearest.shortfall}${unit} short.`;
      }
      return `The closest needs ${nearest.required} — you are ${nearest.shortfall}${unit} short. Reaching ${furthest.required} would open all ${count}.`;
    }
    case 'backlogs':
      return `Clearing your backlogs would open ${count} more ${plural}.`;
    case 'experience':
      return `${count} ${plural} ask for more experience than you have recorded — internships count, so add any you have missed.`;
    case 'graduationYear':
      return `${count} ${plural} are for a different batch. Save them: the same employers usually repeat the drive.`;
    case 'degree':
      return `${count} ${plural} require a different qualification. Worth knowing if you plan to study further.`;
    case 'branch':
      return `${count} ${plural} are restricted to other branches.`;
    case 'age':
      return `${count} ${plural} fall outside the published age limit.`;
    default:
      return `${count} ${plural} are blocked by this criterion.`;
  }
}

export { FIELD_DESCRIPTORS };

import {
  DEGREE_LABELS,
  EXPERIENCE_BANDS,
  OPPORTUNITY_TYPE_LABELS,
  type Degree,
  type OpportunityFilters,
  type OpportunityType,
} from '@odp/shared';

/**
 * Renders a filter set as a sentence.
 *
 * A saved alert has to be self-explanatory weeks later, when the user has
 * forgotten what they typed — "Government jobs · B.Tech · CSE · in Bengaluru"
 * beats a JSON blob in the UI and in the alert email alike.
 */
export function describeFilters(filters: Partial<OpportunityFilters>, query?: string | null): string {
  const parts: string[] = [];

  if (filters.types?.length) {
    parts.push(filters.types.map((t) => OPPORTUNITY_TYPE_LABELS[t as OpportunityType] ?? t).join(' / '));
  }
  if (filters.domains?.length) parts.push(filters.domains.join(' / '));
  if (filters.industries?.length) parts.push(filters.industries.join(' / '));
  if (filters.skills?.length) parts.push(filters.skills.join(', '));
  if (filters.degrees?.length) {
    parts.push(filters.degrees.map((d) => DEGREE_LABELS[d as Degree] ?? d).join(' / '));
  }
  if (filters.branches?.length) parts.push(filters.branches.join(' / '));
  if (filters.graduationYears?.length) parts.push(`${filters.graduationYears.join(', ')} batch`);
  if (filters.experienceBands?.length) {
    const labels = filters.experienceBands
      .map((id) => EXPERIENCE_BANDS.find((b) => b.id === id)?.label ?? id)
      .join(' / ');
    parts.push(labels);
  }
  if (filters.workModes?.length) {
    parts.push(filters.workModes.map((m) => m.toLowerCase()).join(' / '));
  }
  if (filters.cities?.length) parts.push(`in ${filters.cities.join(', ')}`);
  if (filters.companyTypes?.length) {
    parts.push(filters.companyTypes.map((c) => c.replace(/_/g, ' ').toLowerCase()).join(' / '));
  }
  if (filters.deadlineWithinDays != null) {
    parts.push(
      filters.deadlineWithinDays === 0
        ? 'closing today'
        : `closing within ${filters.deadlineWithinDays} days`,
    );
  }
  if (filters.eligibleOnly) parts.push('eligible only');
  if (filters.minSalary != null) parts.push(`at least ₹${filters.minSalary.toLocaleString('en-IN')}`);

  const residual = filters.q ?? query;
  if (residual) parts.push(`matching “${residual}”`);

  return parts.length ? parts.join(' · ') : 'All opportunities';
}

/** A short, human name for a search the user did not name themselves. */
export function suggestName(filters: Partial<OpportunityFilters>, query?: string | null): string {
  if (query?.trim()) return query.trim().slice(0, 60);

  const described = describeFilters(filters);
  return described.length > 60 ? `${described.slice(0, 57)}…` : described;
}

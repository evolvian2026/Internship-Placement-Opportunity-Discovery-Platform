import type { NormalizedOpportunity } from './normalizer';

/**
 * Quality validation — the last gate before an opportunity reaches the
 * database. Rejects rows that would show a user something wrong or unusable,
 * and downgrades rows that are merely incomplete.
 */

export interface ValidationResult {
  ok: boolean;
  /** Reasons the row was rejected outright. */
  errors: string[];
  /** Non-fatal issues; the row is stored but flagged UNVERIFIED. */
  warnings: string[];
  /** 0–100 completeness, surfaced in the admin data-quality view. */
  completeness: number;
}

const MIN_TITLE_LENGTH = 3;
const MAX_FUTURE_DEADLINE_DAYS = 730;

export function validate(
  opportunity: NormalizedOpportunity,
  opts: { now?: Date } = {},
): ValidationResult {
  const now = opts.now ?? new Date();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!opportunity.title || opportunity.title.trim().length < MIN_TITLE_LENGTH) {
    errors.push('Title is missing or too short');
  }
  if (!opportunity.organizationName || opportunity.organizationName.trim().length < 2) {
    errors.push('Organisation name is missing');
  }
  if (!opportunity.externalId) {
    errors.push('Source did not provide a stable identifier');
  }

  try {
    const url = new URL(opportunity.applicationUrl);
    if (!['http:', 'https:'].includes(url.protocol)) errors.push('Application URL is not an HTTP(S) URL');
  } catch {
    errors.push('Application URL is not a valid URL');
  }

  try {
    // eslint-disable-next-line no-new
    new URL(opportunity.sourceUrl);
  } catch {
    errors.push('Source URL is not a valid URL');
  }

  // A deadline already in the past means the posting is stale on arrival.
  if (opportunity.applicationDeadline && opportunity.applicationDeadline < now) {
    errors.push('Application deadline has already passed');
  }
  if (opportunity.applicationDeadline) {
    const daysAhead = (opportunity.applicationDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysAhead > MAX_FUTURE_DEADLINE_DAYS) {
      warnings.push('Deadline is implausibly far in the future — likely a parsing error');
    }
  }
  if (
    opportunity.applicationStartDate &&
    opportunity.applicationDeadline &&
    opportunity.applicationStartDate > opportunity.applicationDeadline
  ) {
    warnings.push('Application start date is after the deadline');
  }

  if (opportunity.salaryMin != null && opportunity.salaryMax != null && opportunity.salaryMin > opportunity.salaryMax) {
    warnings.push('Salary minimum exceeds the maximum');
  }
  if (opportunity.stipendMin != null && opportunity.stipendMax != null && opportunity.stipendMin > opportunity.stipendMax) {
    warnings.push('Stipend minimum exceeds the maximum');
  }

  if (opportunity.description.trim().length < 40) {
    warnings.push('Description is very short');
  }
  if (opportunity.typeConfidence < 0.5) {
    warnings.push('Opportunity type was inferred with low confidence');
  }
  if (opportunity.classificationConfidence < 0.5) {
    warnings.push('Industry/domain could not be classified confidently');
  }
  if (opportunity.locations.length === 0 && opportunity.workMode !== 'REMOTE') {
    warnings.push('No location published');
  }
  if (opportunity.skills.length === 0) {
    warnings.push('No skills identified');
  }
  if (!opportunity.eligibility) {
    warnings.push('No eligibility criteria published');
  }

  // Completeness across the fields that matter to a student's decision.
  const fields: [boolean, number][] = [
    [Boolean(opportunity.description && opportunity.description.length > 100), 15],
    [opportunity.locations.length > 0, 10],
    [opportunity.skills.length > 0, 10],
    [Boolean(opportunity.eligibility), 15],
    [opportunity.applicationDeadline != null, 15],
    [opportunity.salaryMin != null || opportunity.stipendMin != null, 10],
    [opportunity.industryName != null, 5],
    [opportunity.domainName != null, 5],
    [opportunity.responsibilities.length > 0, 5],
    [opportunity.requirements.length > 0, 5],
    [opportunity.selectionProcess.length > 0, 5],
  ];
  const completeness = fields.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0);

  return { ok: errors.length === 0, errors, warnings, completeness };
}

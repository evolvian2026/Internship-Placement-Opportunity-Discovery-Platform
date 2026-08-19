import {
  FRESHER_TYPES,
  GOVERNMENT_TYPES,
  INTERNSHIP_TYPES,
  NOT_SPECIFIED,
  PSU_TYPES,
  type AssistantCitation,
  type OpportunityFilters,
  type OpportunitySummaryDto,
} from '@odp/shared';
import { parseNaturalLanguageQuery } from '../../engines/nlq';
import { formatLongDate } from '../../lib/dates';
import { searchOpportunities } from '../opportunities/opportunity.service';

/**
 * Retrieval layer for the assistant.
 *
 * Every answer the assistant gives is grounded in rows returned from here.
 * The assistant never sees or invents an opportunity that is not in the
 * database (requirement 29).
 */

export type Intent =
  | 'FIND_OPPORTUNITIES'
  | 'CHECK_ELIGIBILITY'
  | 'SKILL_ADVICE'
  | 'DEADLINES'
  | 'COMPANIES_HIRING'
  | 'APPLICATION_ADVICE'
  | 'UNKNOWN';

export interface IntentResult {
  intent: Intent;
  filters: Partial<OpportunityFilters>;
  interpretation: string;
}

/** Classifies what the user is asking, then extracts structured filters. */
export function classifyIntent(question: string): IntentResult {
  const parsed = parseNaturalLanguageQuery(question);
  const q = question.toLowerCase();

  let intent: Intent = 'FIND_OPPORTUNITIES';

  if (/\b(am i eligible|can i apply|which .*(am i|i am) eligible|eligibility)\b/.test(q)) {
    intent = 'CHECK_ELIGIBILITY';
  } else if (/\b(what skills?|which skills?|should i learn|skill gap|missing skills?)\b/.test(q)) {
    intent = 'SKILL_ADVICE';
  } else if (/\b(closing|deadline|last date|expiring|due)\b/.test(q)) {
    intent = 'DEADLINES';
  } else if (/\b(which compan(y|ies)|what compan(y|ies)|who is hiring|companies hiring)\b/.test(q)) {
    intent = 'COMPANIES_HIRING';
  } else if (/\b(not getting shortlisted|rejected|no response|improve my (application|resume|profile))\b/.test(q)) {
    intent = 'APPLICATION_ADVICE';
  }

  const filters: Partial<OpportunityFilters> = { ...parsed.filters };

  // Intent-specific defaults the plain query parser would not infer.
  if (intent === 'DEADLINES' && filters.deadlineWithinDays == null) {
    filters.deadlineWithinDays = 7;
  }
  if (/\bgovernment\b|\bsarkari\b|\bgovt\b/.test(q) && !filters.types?.length) {
    filters.types = [...GOVERNMENT_TYPES];
  }
  if (/\bpsu\b/.test(q) && !filters.types?.length) filters.types = [...PSU_TYPES];
  if (/\bintern(ship)?s?\b/.test(q) && !filters.types?.length) filters.types = [...INTERNSHIP_TYPES];
  if (/\bfresher/.test(q) && !filters.types?.length) filters.types = [...FRESHER_TYPES];

  return { intent, filters, interpretation: parsed.interpretation };
}

export interface RetrievalResult {
  items: OpportunitySummaryDto[];
  total: number;
  filters: Partial<OpportunityFilters>;
  intent: Intent;
  interpretation: string;
}

export async function retrieve(
  question: string,
  userId: string | undefined,
  opts: { limit?: number; eligibleOnly?: boolean } = {},
): Promise<RetrievalResult> {
  const { intent, filters, interpretation } = classifyIntent(question);

  const searchFilters: OpportunityFilters = {
    ...filters,
    // Eligibility questions must only surface things the user can actually apply for.
    eligibleOnly: opts.eligibleOnly ?? intent === 'CHECK_ELIGIBILITY',
    sort: userId ? 'match' : 'newest',
    pageSize: opts.limit ?? 6,
    page: 1,
  };

  const result = await searchOpportunities(searchFilters, {
    userId,
    naturalLanguage: false,
    includeFacets: false,
  });

  return {
    items: result.items,
    total: result.total,
    filters: searchFilters,
    intent,
    interpretation,
  };
}

/**
 * Every opportunity the assistant mentions is returned as a citation carrying
 * company, role, eligibility, deadline, source and the official link
 * (requirement 29).
 */
export function toCitations(items: OpportunitySummaryDto[]): AssistantCitation[] {
  return items.map((item) => ({
    opportunityId: item.id,
    title: item.title,
    organization: item.organizationName,
    eligibility: item.eligibility
      ? item.eligibility.verdict === 'ELIGIBLE'
        ? 'Eligible'
        : item.eligibility.verdict === 'NEEDS_REVIEW'
          ? 'Needs review'
          : 'Not eligible'
      : `${item.educationLabel} · ${item.experienceLabel}`,
    deadline: item.applicationDeadline
      ? (formatLongDate(new Date(item.applicationDeadline)) ?? NOT_SPECIFIED)
      : NOT_SPECIFIED,
    sourceName: item.sourceName,
    applicationUrl: item.applicationUrl,
  }));
}

/** Compact, factual context block handed to the LLM. Nothing else is sent. */
export function buildContextBlock(items: OpportunitySummaryDto[]): string {
  if (items.length === 0) return 'NO_MATCHING_OPPORTUNITIES';

  return items
    .map((item, index) => {
      const lines = [
        `[${index + 1}] ${item.title}`,
        `    Organisation: ${item.organizationName}`,
        `    Type: ${item.opportunityType}`,
        `    Location: ${item.locationLabel} (${item.workMode})`,
        `    Experience: ${item.experienceLabel}`,
        `    Education: ${item.educationLabel}`,
        `    Compensation: ${item.stipendLabel ?? item.salaryLabel}`,
        `    Deadline: ${item.applicationDeadline ? (formatLongDate(new Date(item.applicationDeadline)) ?? NOT_SPECIFIED) : NOT_SPECIFIED}`,
        `    Source: ${item.sourceName} (${item.trustLevel})`,
        `    Apply: ${item.applicationUrl}`,
      ];
      if (item.match) lines.push(`    Match score: ${item.match.overall}%`);
      if (item.eligibility) {
        lines.push(`    Eligibility: ${item.eligibility.verdict}`);
        if (item.eligibility.failed.length) {
          lines.push(`    Not met: ${item.eligibility.failed.map((f) => f.message).join('; ')}`);
        }
        if (item.eligibility.unknown.length) {
          lines.push(`    Unconfirmed: ${item.eligibility.unknown.map((u) => u.label).join(', ')}`);
        }
      }
      if (item.match?.missingSkills.length) {
        lines.push(`    Missing skills: ${item.match.missingSkills.join(', ')}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

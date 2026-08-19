import type { Degree, OpportunityType, WorkMode } from '@odp/shared';

/**
 * What a connector emits. Deliberately loose: connectors do the minimum
 * source-specific work and leave interpretation to the parser/normalizer.
 *
 * Nothing here may be invented by a connector. A field the source does not
 * publish must be left undefined so it becomes "Not Specified" downstream.
 */
export interface RawOpportunity {
  /** The source's own stable identifier for this posting. */
  externalId: string;
  title: string;
  organizationName: string;
  /** Canonical URL of the posting on the source. */
  sourceUrl: string;
  /** Where the user actually applies; defaults to sourceUrl. */
  applicationUrl?: string;
  description?: string;
  /** Free text that may contain eligibility, stipend, dates. */
  rawText?: string;
  locations?: { city?: string; state?: string; country?: string; isRemote?: boolean }[];
  locationText?: string;
  workMode?: WorkMode;
  opportunityType?: OpportunityType;
  typeHint?: string;
  industryHint?: string;
  domainHint?: string;
  role?: string;
  skills?: string[];
  salaryText?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'YEAR' | 'MONTH';
  stipendMin?: number;
  stipendMax?: number;
  durationMonths?: number;
  postedDate?: Date;
  applicationStartDate?: Date;
  applicationDeadline?: Date;
  examDate?: Date;
  vacancies?: number;
  applicationFee?: string;
  eligibilityText?: string;
  eligibility?: Partial<{
    degrees: Degree[];
    branches: string[];
    graduationYears: number[];
    minCgpa: number;
    minPercentage: number;
    maxBacklogs: number;
    minExperienceYears: number;
    maxExperienceYears: number;
    minAge: number;
    maxAge: number;
    genderRequirement: string;
    citizenship: string;
    workAuthorization: string;
  }>;
  selectionProcess?: string[];
  requiredDocuments?: string[];
  responsibilities?: string[];
  requirements?: string[];
  tags?: string[];
  governmentCategory?: string;
  psuCategory?: string;
  internshipCategory?: string;
  gateRequired?: boolean;
  ppoAvailable?: boolean;
  companyWebsite?: string;
  companyLogoUrl?: string;
  /** Only when the source states it — never inferred from the name. */
  companyType?: string;
  companyHeadquarters?: string;
  companyEmployeeCount?: string;
  /** Everything the source returned, retained for audit and re-parsing. */
  rawPayload?: unknown;
}

export interface ConnectorContext {
  sourceId: string;
  sourceSlug: string;
  config: Record<string, unknown>;
  /** Rate-limited, robots-aware fetch. Connectors must not use global fetch. */
  fetchText: (url: string, init?: RequestInit) => Promise<string>;
  fetchJson: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
  log: (level: 'info' | 'warn' | 'error', message: string, payload?: unknown) => void;
  /** Only fetch postings updated since this timestamp, when the source allows. */
  since?: Date;
  limit?: number;
}

export interface Connector {
  kind: string;
  /**
   * Access-policy note recorded against the source. Every connector documents
   * how it obtains data and why that access is permitted.
   */
  accessPolicy: string;
  fetch(ctx: ConnectorContext): Promise<RawOpportunity[]>;
}

export interface IngestionCounters {
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  expired: number;
  failed: number;
}

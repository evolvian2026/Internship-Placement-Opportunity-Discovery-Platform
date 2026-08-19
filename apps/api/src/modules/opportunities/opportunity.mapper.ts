import {
  DEGREE_LABELS,
  NOT_SPECIFIED,
  OPPORTUNITY_TYPE_LABELS,
  type ApplicationStatus,
  type CompanySummaryDto,
  type OpportunityDetailDto,
  type OpportunitySummaryDto,
} from '@odp/shared';
import type { Company } from '@prisma/client';
import { env } from '../../config/env';
import { formatLongDate, toIso } from '../../lib/dates';
import { formatSalary, formatStipend } from '../../lib/money';
import { truncate } from '../../lib/text';
import type { OpportunitySnapshot } from '../../engines/types';
import type { OpportunityWithRelations } from './opportunity.include';

export function toCompanySummary(
  company: Company | null,
  isFollowed?: boolean,
): CompanySummaryDto | null {
  if (!company) return null;
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    logoUrl: company.logoUrl,
    industry: company.industryName,
    companyType: company.companyType,
    website: company.website,
    ...(isFollowed === undefined ? {} : { isFollowed }),
  };
}

/** "Bengaluru / Remote", "Bengaluru, Hyderabad", "Not Specified" */
export function locationLabel(opportunity: OpportunityWithRelations): string {
  const parts: string[] = [];
  const hasRemote = opportunity.workMode === 'REMOTE' || opportunity.locations.some((l) => l.isRemote);

  const cities = [
    ...new Set(opportunity.locations.map((l) => l.city).filter((c): c is string => Boolean(c))),
  ];
  parts.push(...cities.slice(0, 3));

  if (hasRemote) parts.push('Remote');
  if (parts.length === 0) {
    const states = [
      ...new Set(opportunity.locations.map((l) => l.state).filter((s): s is string => Boolean(s))),
    ];
    parts.push(...states.slice(0, 2));
  }
  if (parts.length === 0) return NOT_SPECIFIED;

  const label = parts.join(' / ');
  const extra = cities.length - 3;
  return extra > 0 ? `${label} +${extra} more` : label;
}

export function experienceLabel(opportunity: OpportunityWithRelations): string {
  const e = opportunity.eligibility;
  if (!e || (e.minExperienceYears == null && e.maxExperienceYears == null)) return NOT_SPECIFIED;
  const min = e.minExperienceYears ?? 0;
  const max = e.maxExperienceYears;
  if (min === 0 && (max === 0 || max === null)) return 'Freshers';
  if (max == null) return `${min}+ years`;
  if (min === max) return `${min} year${min === 1 ? '' : 's'}`;
  return `${min}–${max} years`;
}

export function educationLabel(opportunity: OpportunityWithRelations): string {
  const e = opportunity.eligibility;
  if (!e) return NOT_SPECIFIED;
  const degrees = e.degrees.map((d) => DEGREE_LABELS[d]);
  if (degrees.length === 0) return e.branches.length ? e.branches.join(', ') : NOT_SPECIFIED;
  const shown = degrees.slice(0, 4).join(' / ');
  return degrees.length > 4 ? `${shown} +${degrees.length - 4}` : shown;
}

export function durationLabel(months: number | null): string | null {
  if (months == null) return null;
  if (months < 1) return 'Less than a month';
  if (months === 1) return '1 month';
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? '' : 's'}`;
  return `${months} months`;
}

/** Primary source is the official one when available, else most recent. */
export function primarySource(opportunity: OpportunityWithRelations) {
  return (
    opportunity.sources.find((s) => s.isPrimary) ??
    opportunity.sources.find((s) => s.source.trustLevel === 'OFFICIAL') ??
    opportunity.sources[0] ??
    null
  );
}

export interface MapperContext {
  match?: OpportunitySummaryDto['match'];
  eligibility?: OpportunitySummaryDto['eligibility'];
  isSaved?: boolean;
  applicationStatus?: ApplicationStatus | null;
  isFollowedCompany?: boolean;
}

export function toSummaryDto(
  opportunity: OpportunityWithRelations,
  ctx: MapperContext = {},
): OpportunitySummaryDto {
  const source = primarySource(opportunity);

  return {
    id: opportunity.id,
    slug: opportunity.slug,
    title: opportunity.title,
    company: toCompanySummary(opportunity.company, ctx.isFollowedCompany),
    organizationName: opportunity.organizationName,
    opportunityType: opportunity.opportunityType,
    industry: opportunity.industry?.name ?? null,
    domain: opportunity.domain?.name ?? null,
    role: opportunity.role,
    skills: opportunity.skills.map((s) => s.skill.name),
    locations: opportunity.locations.map((l) => ({
      city: l.city,
      state: l.state,
      country: l.country,
      isRemote: l.isRemote,
    })),
    locationLabel: locationLabel(opportunity),
    workMode: opportunity.workMode,
    experienceLabel: experienceLabel(opportunity),
    educationLabel: educationLabel(opportunity),
    salaryLabel: formatSalary(
      opportunity.salaryMin,
      opportunity.salaryMax,
      opportunity.salaryCurrency,
      opportunity.salaryPeriod,
    ),
    stipendLabel: formatStipend(opportunity.stipendMin, opportunity.stipendMax, opportunity.salaryCurrency),
    durationLabel: durationLabel(opportunity.durationMonths),
    applicationDeadline: toIso(opportunity.applicationDeadline),
    postedDate: toIso(opportunity.postedDate),
    lastVerifiedAt: toIso(opportunity.lastVerifiedAt),
    status: opportunity.status,
    tags: opportunity.tags,
    sourceName: source?.source.name ?? 'Manual entry',
    sourceUrl: source?.sourceUrl ?? opportunity.applicationUrl,
    applicationUrl: opportunity.applicationUrl,
    trustLevel: source?.source.trustLevel ?? 'THIRD_PARTY',
    sourceCount: opportunity.sources.length,
    fraudFlags: opportunity.fraudFlags,
    ...(ctx.match ? { match: ctx.match } : {}),
    ...(ctx.eligibility ? { eligibility: ctx.eligibility } : {}),
    ...(ctx.isSaved === undefined ? {} : { isSaved: ctx.isSaved }),
    ...(ctx.applicationStatus === undefined ? {} : { applicationStatus: ctx.applicationStatus }),
  };
}

/** JSON-LD JobPosting, so public pages are eligible for rich results. */
function buildJsonLd(opportunity: OpportunityWithRelations, canonicalUrl: string): Record<string, unknown> {
  const locations = opportunity.locations.filter((l) => !l.isRemote);
  const isRemote = opportunity.workMode === 'REMOTE' || opportunity.locations.some((l) => l.isRemote);

  const employmentTypeMap: Record<string, string> = {
    FULL_TIME: 'FULL_TIME',
    PART_TIME: 'PART_TIME',
    INTERNSHIP: 'INTERN',
    GOVERNMENT_INTERNSHIP: 'INTERN',
    CONTRACT: 'CONTRACTOR',
    APPRENTICESHIP: 'INTERN',
    TRAINEE: 'FULL_TIME',
    GRADUATE_PROGRAM: 'FULL_TIME',
  };

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: opportunity.title,
    description: truncate(opportunity.description || opportunity.title, 5000),
    identifier: {
      '@type': 'PropertyValue',
      name: opportunity.organizationName,
      value: opportunity.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: opportunity.organizationName,
      ...(opportunity.company?.website ? { sameAs: opportunity.company.website } : {}),
      ...(opportunity.company?.logoUrl ? { logo: opportunity.company.logoUrl } : {}),
    },
    employmentType: employmentTypeMap[opportunity.opportunityType] ?? 'OTHER',
    url: canonicalUrl,
    directApply: false,
  };

  if (opportunity.postedDate) jsonLd.datePosted = opportunity.postedDate.toISOString();
  if (opportunity.applicationDeadline) jsonLd.validThrough = opportunity.applicationDeadline.toISOString();

  if (locations.length > 0) {
    jsonLd.jobLocation = locations.map((l) => ({
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(l.city ? { addressLocality: l.city } : {}),
        ...(l.state ? { addressRegion: l.state } : {}),
        addressCountry: l.country ?? 'IN',
      },
    }));
  }
  if (isRemote) {
    jsonLd.jobLocationType = 'TELECOMMUTE';
    jsonLd.applicantLocationRequirements = {
      '@type': 'Country',
      name: opportunity.locations[0]?.country ?? 'India',
    };
  }

  // Salary is only published when the source published it.
  if (opportunity.salaryMin != null || opportunity.salaryMax != null) {
    jsonLd.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: opportunity.salaryCurrency,
      value: {
        '@type': 'QuantitativeValue',
        ...(opportunity.salaryMin != null ? { minValue: opportunity.salaryMin } : {}),
        ...(opportunity.salaryMax != null ? { maxValue: opportunity.salaryMax } : {}),
        unitText: opportunity.salaryPeriod === 'MONTH' ? 'MONTH' : 'YEAR',
      },
    };
  }

  return jsonLd;
}

export function toDetailDto(
  opportunity: OpportunityWithRelations,
  ctx: MapperContext = {},
): OpportunityDetailDto {
  const summary = toSummaryDto(opportunity, ctx);
  const canonicalUrl = `${env.PUBLIC_SITE_URL}/opportunities/${opportunity.slug}`;
  const e = opportunity.eligibility;

  const importantDates = [
    { label: 'Application Opens', date: toIso(opportunity.applicationStartDate) },
    { label: 'Application Deadline', date: toIso(opportunity.applicationDeadline) },
    { label: 'Exam Date', date: toIso(opportunity.examDate) },
    { label: 'Posted', date: toIso(opportunity.postedDate) },
  ].filter((d) => d.date !== null);

  const seoDescriptionParts = [
    OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType],
    `at ${opportunity.organizationName}`,
    summary.locationLabel !== NOT_SPECIFIED ? `in ${summary.locationLabel}` : '',
    summary.experienceLabel !== NOT_SPECIFIED ? `for ${summary.experienceLabel}` : '',
    opportunity.applicationDeadline ? `Apply by ${formatLongDate(opportunity.applicationDeadline)}.` : '',
  ].filter(Boolean);

  return {
    ...summary,
    description: opportunity.description,
    responsibilities: opportunity.responsibilities,
    requirements: opportunity.requirements,
    preferredSkills: opportunity.preferredSkills,
    selectionProcess: opportunity.selectionProcess,
    requiredDocuments: opportunity.requiredDocuments,
    importantDates,
    eligibilityDetail: {
      degrees: e?.degrees ?? [],
      branches: e?.branches ?? [],
      graduationYears: e?.graduationYears ?? [],
      minCgpa: e?.minCgpa ?? null,
      minPercentage: e?.minPercentage ?? null,
      maxBacklogs: e?.maxBacklogs ?? null,
      minExperienceYears: e?.minExperienceYears ?? null,
      maxExperienceYears: e?.maxExperienceYears ?? null,
      minAge: e?.minAge ?? null,
      maxAge: e?.maxAge ?? null,
      genderRequirement: e?.genderRequirement ?? null,
      citizenship: e?.citizenship ?? null,
      workAuthorization: e?.workAuthorization ?? null,
      rawText: e?.rawText ?? null,
    },
    salaryMin: opportunity.salaryMin,
    salaryMax: opportunity.salaryMax,
    salaryCurrency: opportunity.salaryCurrency,
    salaryPeriod: opportunity.salaryPeriod,
    stipendMin: opportunity.stipendMin,
    stipendMax: opportunity.stipendMax,
    durationMonths: opportunity.durationMonths,
    applicationStartDate: toIso(opportunity.applicationStartDate),
    vacancies: opportunity.vacancies,
    applicationFee: opportunity.applicationFee,
    examDate: toIso(opportunity.examDate),
    governmentCategory: opportunity.governmentCategory,
    psuCategory: opportunity.psuCategory,
    gateRequired: opportunity.gateRequired,
    ppoAvailable: opportunity.ppoAvailable,
    sources: opportunity.sources.map((s) => ({
      sourceId: s.sourceId,
      sourceName: s.source.name,
      sourceUrl: s.sourceUrl,
      trustLevel: s.source.trustLevel,
      isPrimary: s.isPrimary,
      lastVerifiedAt: toIso(s.lastVerifiedAt),
    })),
    seo: {
      title: `${opportunity.title} at ${opportunity.organizationName} | Opportunity Discovery`,
      description: truncate(seoDescriptionParts.join(' '), 160),
      canonicalUrl,
      jsonLd: buildJsonLd(opportunity, canonicalUrl),
    },
  };
}

/** Prisma row -> engine snapshot. */
export function toOpportunitySnapshot(opportunity: OpportunityWithRelations): OpportunitySnapshot {
  return {
    id: opportunity.id,
    title: opportunity.title,
    organizationName: opportunity.organizationName,
    opportunityType: opportunity.opportunityType,
    industryName: opportunity.industry?.name ?? null,
    domainName: opportunity.domain?.name ?? null,
    role: opportunity.role,
    workMode: opportunity.workMode,
    skills: opportunity.skills.map((s) => ({
      name: s.skill.name,
      isRequired: s.isRequired,
      weight: s.weight,
    })),
    locations: opportunity.locations.map((l) => ({
      city: l.city,
      state: l.state,
      country: l.country,
      isRemote: l.isRemote,
    })),
    salaryMin: opportunity.salaryMin,
    salaryMax: opportunity.salaryMax,
    stipendMin: opportunity.stipendMin,
    stipendMax: opportunity.stipendMax,
    applicationDeadline: opportunity.applicationDeadline,
    eligibility: opportunity.eligibility
      ? {
          degrees: opportunity.eligibility.degrees,
          branches: opportunity.eligibility.branches,
          graduationYears: opportunity.eligibility.graduationYears,
          minCgpa: opportunity.eligibility.minCgpa,
          minPercentage: opportunity.eligibility.minPercentage,
          maxBacklogs: opportunity.eligibility.maxBacklogs,
          minExperienceYears: opportunity.eligibility.minExperienceYears,
          maxExperienceYears: opportunity.eligibility.maxExperienceYears,
          minAge: opportunity.eligibility.minAge,
          maxAge: opportunity.eligibility.maxAge,
          genderRequirement: opportunity.eligibility.genderRequirement,
          citizenship: opportunity.eligibility.citizenship,
          workAuthorization: opportunity.eligibility.workAuthorization,
          rawText: opportunity.eligibility.rawText,
        }
      : null,
  };
}

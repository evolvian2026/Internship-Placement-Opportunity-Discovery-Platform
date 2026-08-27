import {
  GOVERNMENT_TYPES,
  INTERNSHIP_TYPES,
  PSU_TYPES,
  canonicalizeSkills,
  type Degree,
  type OpportunityType,
  type WorkMode,
} from '@odp/shared';
import { stripHtml, truncate } from '../lib/text';
import {
  classifyDomain,
  classifyGovernmentCategory,
  classifyInternshipCategory,
  classifyPsuCategory,
  classifyType,
  classifyWorkMode,
} from './classifier';
import { parseOpportunityText } from './parser';
import type { RawOpportunity } from './types';

/**
 * Normalizer: turns a `RawOpportunity` from any connector into the single
 * common structure the database stores.
 *
 * Precedence at every field: **what the source explicitly provided** beats
 * **what the parser inferred**, and neither is ever replaced by a guess.
 */

export interface NormalizedOpportunity {
  externalId: string;
  title: string;
  organizationName: string;
  opportunityType: OpportunityType;
  typeConfidence: number;
  industryName: string | null;
  domainName: string | null;
  classificationConfidence: number;
  role: string | null;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  selectionProcess: string[];
  requiredDocuments: string[];
  skills: string[];
  workMode: WorkMode;
  locations: { city: string | null; state: string | null; country: string | null; isRemote: boolean }[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string | null;
  stipendMin: number | null;
  stipendMax: number | null;
  durationMonths: number | null;
  applicationStartDate: Date | null;
  applicationDeadline: Date | null;
  postedDate: Date | null;
  examDate: Date | null;
  vacancies: number | null;
  applicationFee: string | null;
  applicationUrl: string;
  sourceUrl: string;
  tags: string[];
  governmentCategory: string | null;
  psuCategory: string | null;
  internshipCategory: string | null;
  gateRequired: boolean | null;
  ppoAvailable: boolean | null;
  companyWebsite: string | null;
  companyLogoUrl: string | null;
  companyType: string | null;
  companyHeadquarters: string | null;
  companyEmployeeCount: string | null;
  eligibility: {
    degrees: Degree[];
    branches: string[];
    graduationYears: number[];
    minCgpa: number | null;
    minPercentage: number | null;
    maxBacklogs: number | null;
    minExperienceYears: number | null;
    maxExperienceYears: number | null;
    minAge: number | null;
    maxAge: number | null;
    genderRequirement: string | null;
    citizenship: string | null;
    workAuthorization: string | null;
    rawText: string | null;
  } | null;
}

/** Splits "Bengaluru, Karnataka" / "Pune | Remote" into structured locations. */
export function parseLocationText(text: string | undefined): NormalizedOpportunity['locations'] {
  if (!text) return [];
  const cleaned = stripHtml(text).trim();
  if (!cleaned) return [];

  if (/^(remote|work\s+from\s+home|anywhere)$/i.test(cleaned)) {
    return [{ city: null, state: null, country: 'India', isRemote: true }];
  }

  const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry',
    'Chandigarh',
  ];

  const chunks = cleaned
    .split(/\s*[|/;]\s*|\s+(?:and|or)\s+/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 10);

  const out: NormalizedOpportunity['locations'] = [];
  for (const chunk of chunks) {
    if (/^(remote|work\s+from\s+home|anywhere)$/i.test(chunk)) {
      out.push({ city: null, state: null, country: 'India', isRemote: true });
      continue;
    }
    const parts = chunk.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    let city: string | null = parts[0] ?? null;
    let state: string | null = null;
    let country: string | null = 'India';

    if (parts.length >= 2) {
      const second = parts[1];
      const matchedState = INDIAN_STATES.find((s) => s.toLowerCase() === second.toLowerCase());
      if (matchedState) {
        state = matchedState;
      } else if (parts.length === 2 && second.length > 3 && !/india/i.test(second)) {
        country = second;
      }
    }
    if (parts.length >= 3) {
      state = INDIAN_STATES.find((s) => s.toLowerCase() === parts[1].toLowerCase()) ?? parts[1];
      country = parts[2];
    }
    // A "city" that is really a state name should be recorded as one.
    if (city && INDIAN_STATES.some((s) => s.toLowerCase() === city!.toLowerCase()) && !state) {
      state = city;
      city = null;
    }
    out.push({ city, state, country, isRemote: false });
  }
  return out;
}

export function normalize(raw: RawOpportunity): NormalizedOpportunity {
  const description = stripHtml(raw.description ?? '');
  const searchText = [raw.title, description, raw.rawText, raw.eligibilityText]
    .filter(Boolean)
    .join('\n');
  const parsed = parseOpportunityText(searchText);

  const type = classifyType({
    title: raw.title,
    description,
    typeHint: raw.typeHint ?? raw.opportunityType,
    typeDefault: raw.typeDefault,
    organizationName: raw.organizationName,
  });
  const opportunityType = raw.opportunityType ?? type.value;

  const classification = classifyDomain({
    title: raw.title,
    description,
    domainHint: raw.domainHint,
    industryHint: raw.industryHint,
    skills: raw.skills,
  });

  const workMode = classifyWorkMode({
    workMode: raw.workMode,
    locationText: raw.locationText,
    title: raw.title,
    description,
  });

  const locations = raw.locations?.length
    ? raw.locations.map((l) => ({
        city: l.city ?? null,
        state: l.state ?? null,
        country: l.country ?? 'India',
        isRemote: l.isRemote ?? false,
      }))
    : parseLocationText(raw.locationText);

  if (locations.length === 0 && workMode === 'REMOTE') {
    locations.push({ city: null, state: null, country: 'India', isRemote: true });
  }

  // Compensation: explicit fields win, then the salary text, then body text.
  const fromSalaryText = raw.salaryText ? parseOpportunityText(raw.salaryText).compensation : null;
  const comp = fromSalaryText?.min != null ? fromSalaryText : parsed.compensation;

  const isInternshipLike = INTERNSHIP_TYPES.includes(opportunityType) || opportunityType === 'APPRENTICESHIP';

  let salaryMin = raw.salaryMin ?? null;
  let salaryMax = raw.salaryMax ?? null;
  let salaryPeriod: string | null = raw.salaryPeriod ?? null;
  let stipendMin = raw.stipendMin ?? null;
  let stipendMax = raw.stipendMax ?? null;

  if (salaryMin == null && stipendMin == null && comp.min != null) {
    // A monthly figure on an internship is a stipend, not a salary.
    if (isInternshipLike && comp.period === 'MONTH') {
      stipendMin = comp.min;
      stipendMax = comp.max;
    } else {
      salaryMin = comp.min;
      salaryMax = comp.max;
      salaryPeriod = comp.period;
    }
  }

  const skills = canonicalizeSkills([...(raw.skills ?? []), ...parsed.skills]);

  const eligibilityFromSource = raw.eligibility ?? {};
  const hasAnyEligibility =
    Object.keys(eligibilityFromSource).length > 0 ||
    parsed.degrees.length > 0 ||
    parsed.branches.length > 0 ||
    parsed.graduationYears.length > 0 ||
    parsed.minCgpa != null ||
    parsed.minPercentage != null ||
    parsed.maxBacklogs != null ||
    parsed.minExperienceYears != null ||
    parsed.minAge != null ||
    Boolean(raw.eligibilityText);

  const applicationUrl = raw.applicationUrl ?? raw.sourceUrl;

  return {
    externalId: raw.externalId,
    title: raw.title.trim().slice(0, 200),
    organizationName: raw.organizationName.trim().slice(0, 160),
    opportunityType,
    typeConfidence: raw.opportunityType ? 1 : type.confidence,
    industryName: classification.value.industry,
    domainName: classification.value.domain,
    classificationConfidence: classification.confidence,
    role: raw.role ?? null,
    description: truncate(description, 30_000),
    responsibilities: raw.responsibilities ?? parsed.responsibilities,
    requirements: raw.requirements ?? parsed.requirements,
    preferredSkills: [],
    selectionProcess: raw.selectionProcess ?? parsed.selectionProcess,
    requiredDocuments: raw.requiredDocuments ?? parsed.requiredDocuments,
    skills,
    workMode,
    locations,
    salaryMin,
    salaryMax,
    salaryCurrency: raw.salaryCurrency ?? 'INR',
    salaryPeriod,
    stipendMin,
    stipendMax,
    durationMonths: raw.durationMonths ?? parsed.durationMonths,
    applicationStartDate: raw.applicationStartDate ?? null,
    applicationDeadline: raw.applicationDeadline ?? parsed.deadline,
    postedDate: raw.postedDate ?? null,
    examDate: raw.examDate ?? null,
    vacancies: raw.vacancies ?? parsed.vacancies,
    applicationFee: raw.applicationFee ?? parsed.applicationFee,
    applicationUrl,
    sourceUrl: raw.sourceUrl,
    tags: [...new Set(raw.tags ?? [])].slice(0, 30),
    governmentCategory:
      raw.governmentCategory ??
      (GOVERNMENT_TYPES.includes(opportunityType) || PSU_TYPES.includes(opportunityType)
        ? classifyGovernmentCategory({
            title: raw.title,
            organizationName: raw.organizationName,
            description,
          })
        : null),
    psuCategory:
      raw.psuCategory ??
      (PSU_TYPES.includes(opportunityType) ? classifyPsuCategory({ title: raw.title, description }) : null),
    internshipCategory:
      raw.internshipCategory ??
      (INTERNSHIP_TYPES.includes(opportunityType)
        ? classifyInternshipCategory({
            title: raw.title,
            description,
            workMode,
            stipendMin,
            opportunityType,
          })
        : null),
    gateRequired: raw.gateRequired ?? (/\bgate\s+(score|qualified|20\d{2})\b/i.test(searchText) ? true : null),
    ppoAvailable: raw.ppoAvailable ?? (/\bppo\b|pre[\s-]placement\s+offer/i.test(searchText) ? true : null),
    companyWebsite: raw.companyWebsite ?? null,
    companyLogoUrl: raw.companyLogoUrl ?? null,
    companyType: raw.companyType ?? null,
    companyHeadquarters: raw.companyHeadquarters ?? null,
    companyEmployeeCount: raw.companyEmployeeCount ?? null,
    eligibility: hasAnyEligibility
      ? {
          degrees: eligibilityFromSource.degrees ?? parsed.degrees,
          branches: eligibilityFromSource.branches ?? parsed.branches,
          graduationYears: eligibilityFromSource.graduationYears ?? parsed.graduationYears,
          minCgpa: eligibilityFromSource.minCgpa ?? parsed.minCgpa,
          minPercentage: eligibilityFromSource.minPercentage ?? parsed.minPercentage,
          maxBacklogs: eligibilityFromSource.maxBacklogs ?? parsed.maxBacklogs,
          minExperienceYears: eligibilityFromSource.minExperienceYears ?? parsed.minExperienceYears,
          maxExperienceYears: eligibilityFromSource.maxExperienceYears ?? parsed.maxExperienceYears,
          minAge: eligibilityFromSource.minAge ?? parsed.minAge,
          maxAge: eligibilityFromSource.maxAge ?? parsed.maxAge,
          genderRequirement: eligibilityFromSource.genderRequirement ?? null,
          citizenship: eligibilityFromSource.citizenship ?? null,
          workAuthorization: eligibilityFromSource.workAuthorization ?? null,
          // The verbatim text is always kept so nothing is lost in parsing.
          rawText: raw.eligibilityText ?? null,
        }
      : null,
  };
}

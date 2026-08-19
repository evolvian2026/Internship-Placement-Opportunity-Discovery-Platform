import {
  COMPANY_TYPES,
  DEGREES,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  WORK_MODES,
} from '@odp/shared';
import { z } from 'zod';

/** Query strings carry arrays as `a,b,c` (or repeated keys). */
const csv = <T extends string>(values: readonly T[]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const list = Array.isArray(v) ? v : v.split(',');
      return list.map((s) => s.trim()).filter(Boolean) as T[];
    })
    .refine(
      (list) => list === undefined || list.every((item) => (values as readonly string[]).includes(item)),
      { message: `Allowed values: ${values.join(', ')}` },
    );

const csvFree = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const list = Array.isArray(v) ? v : v.split(',');
    return list.map((s) => s.trim()).filter(Boolean);
  });

const csvInt = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const list = Array.isArray(v) ? v : v.split(',');
    return list
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  });

const numeric = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= min && v <= max), {
      message: `Must be between ${min} and ${max}`,
    });

const boolean = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1'));

export const searchQuerySchema = z.object({
  q: z.string().trim().max(300).optional(),
  types: csv(OPPORTUNITY_TYPES),
  industries: csvFree,
  domains: csvFree,
  skills: csvFree,
  companyIds: csvFree,
  workModes: csv(WORK_MODES),
  cities: csvFree,
  states: csvFree,
  countries: csvFree,
  degrees: csv(DEGREES),
  branches: csvFree,
  graduationYears: csvInt,
  experienceBands: csvFree,
  companyTypes: csv(COMPANY_TYPES),
  statuses: csv(OPPORTUNITY_STATUSES),
  governmentCategories: csvFree,
  psuCategories: csvFree,
  internshipCategories: csvFree,
  minSalary: numeric(0, 100_000_000),
  maxSalary: numeric(0, 100_000_000),
  deadlineWithinDays: numeric(0, 365),
  postedWithinDays: numeric(0, 365),
  minMatchScore: numeric(0, 100),
  eligibleOnly: boolean,
  nl: boolean,
  sort: z.enum(['relevance', 'deadline', 'newest', 'match', 'salary']).optional(),
  page: numeric(1, 1000),
  pageSize: numeric(1, 50),
});

const eligibilityInput = z.object({
  degrees: z.array(z.enum(DEGREES)).max(25).optional().default([]),
  branches: z.array(z.string().trim().max(80)).max(40).optional().default([]),
  graduationYears: z.array(z.number().int().min(1970).max(2100)).max(15).optional().default([]),
  minCgpa: z.number().min(0).max(10).nullable().optional(),
  minPercentage: z.number().min(0).max(100).nullable().optional(),
  maxBacklogs: z.number().int().min(0).max(60).nullable().optional(),
  minExperienceYears: z.number().min(0).max(50).nullable().optional(),
  maxExperienceYears: z.number().min(0).max(50).nullable().optional(),
  minAge: z.number().int().min(14).max(100).nullable().optional(),
  maxAge: z.number().int().min(14).max(100).nullable().optional(),
  genderRequirement: z.string().trim().max(120).nullable().optional(),
  citizenship: z.string().trim().max(120).nullable().optional(),
  workAuthorization: z.string().trim().max(200).nullable().optional(),
  rawText: z.string().trim().max(5000).nullable().optional(),
});

const locationInput = z.object({
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional().default('India'),
  isRemote: z.boolean().optional().default(false),
});

export const createOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(200),
  organizationName: z.string().trim().min(2).max(160),
  companyId: z.string().uuid().nullable().optional(),
  opportunityType: z.enum(OPPORTUNITY_TYPES),
  industrySlug: z.string().trim().max(80).nullable().optional(),
  domainSlug: z.string().trim().max(80).nullable().optional(),
  role: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(30_000).optional().default(''),
  responsibilities: z.array(z.string().trim().max(600)).max(40).optional().default([]),
  requirements: z.array(z.string().trim().max(600)).max(40).optional().default([]),
  preferredSkills: z.array(z.string().trim().max(80)).max(40).optional().default([]),
  selectionProcess: z.array(z.string().trim().max(300)).max(20).optional().default([]),
  requiredDocuments: z.array(z.string().trim().max(200)).max(20).optional().default([]),
  skills: z.array(z.string().trim().max(80)).max(50).optional().default([]),
  workMode: z.enum(WORK_MODES).optional().default('NOT_SPECIFIED'),
  locations: z.array(locationInput).max(20).optional().default([]),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  salaryCurrency: z.string().trim().length(3).optional().default('INR'),
  salaryPeriod: z.enum(['YEAR', 'MONTH']).nullable().optional(),
  stipendMin: z.number().int().min(0).nullable().optional(),
  stipendMax: z.number().int().min(0).nullable().optional(),
  durationMonths: z.number().int().min(0).max(120).nullable().optional(),
  applicationStartDate: z.string().datetime().nullable().optional(),
  applicationDeadline: z.string().datetime().nullable().optional(),
  postedDate: z.string().datetime().nullable().optional(),
  examDate: z.string().datetime().nullable().optional(),
  vacancies: z.number().int().min(0).max(1_000_000).nullable().optional(),
  applicationFee: z.string().trim().max(200).nullable().optional(),
  applicationUrl: z.string().url().max(2000),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceSlug: z.string().trim().max(80).optional(),
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional().default([]),
  governmentCategory: z.string().trim().max(80).nullable().optional(),
  psuCategory: z.string().trim().max(80).nullable().optional(),
  internshipCategory: z.string().trim().max(80).nullable().optional(),
  gateRequired: z.boolean().nullable().optional(),
  ppoAvailable: z.boolean().nullable().optional(),
  eligibility: eligibilityInput.nullable().optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial();

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

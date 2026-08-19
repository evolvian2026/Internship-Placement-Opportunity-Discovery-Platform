import type { OpportunityStatus } from '@odp/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { normalizeCompanyName, slugify, uniqueSlug } from '../lib/text';
import { resolveSkillIds } from '../modules/profile/skills.service';
import { computeDedupeHash } from './dedupe';
import type { NormalizedOpportunity } from './normalizer';

/**
 * Persistence layer for the ingestion pipeline: resolves the taxonomy and the
 * company, then writes the opportunity and all of its child rows.
 */

const industryCache = new Map<string, string>();
const domainCache = new Map<string, string>();

export function clearTaxonomyCache(): void {
  industryCache.clear();
  domainCache.clear();
}

/** Finds an industry by name, creating it if an ingested posting introduces one. */
export async function resolveIndustryId(name: string | null): Promise<string | null> {
  if (!name) return null;
  const key = name.toLowerCase();
  const cached = industryCache.get(key);
  if (cached) return cached;

  const industry = await prisma.industry.upsert({
    where: { name },
    update: {},
    create: { name, slug: slugify(name) },
    select: { id: true },
  });
  industryCache.set(key, industry.id);
  return industry.id;
}

export async function resolveDomainId(
  industryId: string | null,
  name: string | null,
): Promise<string | null> {
  if (!name || !industryId) return null;
  const key = `${industryId}:${name.toLowerCase()}`;
  const cached = domainCache.get(key);
  if (cached) return cached;

  const existing = await prisma.domain.findFirst({
    where: { industryId, name },
    select: { id: true },
  });
  if (existing) {
    domainCache.set(key, existing.id);
    return existing.id;
  }

  // Slugs are globally unique, so disambiguate a name reused across industries.
  const baseSlug = slugify(name);
  const slugTaken = await prisma.domain.findUnique({ where: { slug: baseSlug }, select: { id: true } });
  const created = await prisma.domain.create({
    data: {
      industryId,
      name,
      slug: slugTaken ? `${baseSlug}-${industryId.slice(0, 6)}` : baseSlug,
    },
    select: { id: true },
  });
  domainCache.set(key, created.id);
  return created.id;
}

export interface ResolvedCompany {
  id: string;
  name: string;
}

/** Finds or creates the company, collapsing legal-suffix variants. */
export async function resolveCompany(
  organizationName: string,
  extras: {
    website?: string | null;
    logoUrl?: string | null;
    industryName?: string | null;
    companyType?: string | null;
    headquarters?: string | null;
    employeeCount?: string | null;
  } = {},
): Promise<ResolvedCompany | null> {
  const normalized = normalizeCompanyName(organizationName);
  if (!normalized) return null;

  const existing = await prisma.company.findUnique({
    where: { normalizedName: normalized },
    select: {
      id: true,
      name: true,
      website: true,
      logoUrl: true,
      companyType: true,
      industryName: true,
      headquarters: true,
      employeeCount: true,
    },
  });

  if (existing) {
    // Backfill details a later source published but the first one did not.
    // Existing values are never overwritten — the first source that published
    // a field keeps it.
    const patch: Prisma.CompanyUpdateInput = {};
    if (!existing.website && extras.website) patch.website = extras.website;
    if (!existing.logoUrl && extras.logoUrl) patch.logoUrl = extras.logoUrl;
    if (!existing.companyType && extras.companyType) patch.companyType = extras.companyType as never;
    if (!existing.industryName && extras.industryName) patch.industryName = extras.industryName;
    if (!existing.headquarters && extras.headquarters) patch.headquarters = extras.headquarters;
    if (!existing.employeeCount && extras.employeeCount) patch.employeeCount = extras.employeeCount;
    if (Object.keys(patch).length) {
      await prisma.company.update({ where: { id: existing.id }, data: patch });
    }
    return { id: existing.id, name: existing.name };
  }

  const slugBase = slugify(organizationName) || normalized;
  const slugTaken = await prisma.company.findUnique({ where: { slug: slugBase }, select: { id: true } });

  const created = await prisma.company.create({
    data: {
      name: organizationName,
      normalizedName: normalized,
      slug: slugTaken ? uniqueSlug(organizationName, normalized.slice(0, 6)) : slugBase,
      website: extras.website ?? null,
      logoUrl: extras.logoUrl ?? null,
      industryName: extras.industryName ?? null,
      companyType: (extras.companyType as never) ?? null,
      headquarters: extras.headquarters ?? null,
      employeeCount: extras.employeeCount ?? null,
    },
    select: { id: true, name: true },
  });
  return { id: created.id, name: created.name };
}

export interface PersistResult {
  opportunityId: string;
  created: boolean;
}

/**
 * Writes a normalized opportunity, either creating it or updating the existing
 * row this source previously published.
 */
export async function persistOpportunity(input: {
  normalized: NormalizedOpportunity;
  sourceId: string;
  status: OpportunityStatus;
  fraudFlags: string[];
  fraudScore: number;
  existingOpportunityId?: string;
  isPrimarySource: boolean;
  rawPayload?: unknown;
}): Promise<PersistResult> {
  const { normalized, sourceId, status, existingOpportunityId, isPrimarySource } = input;

  const industryId = await resolveIndustryId(normalized.industryName);
  const domainId = await resolveDomainId(industryId, normalized.domainName);
  const company = await resolveCompany(normalized.organizationName, {
    website: normalized.companyWebsite,
    logoUrl: normalized.companyLogoUrl,
    industryName: normalized.industryName,
    companyType: normalized.companyType,
    headquarters: normalized.companyHeadquarters,
    employeeCount: normalized.companyEmployeeCount,
  });
  const skills = await resolveSkillIds(normalized.skills);

  const dedupeHash = computeDedupeHash({
    title: normalized.title,
    organizationName: normalized.organizationName,
    city: normalized.locations[0]?.city ?? null,
  });

  const scalarData = {
    title: normalized.title,
    organizationName: normalized.organizationName,
    companyId: company?.id ?? null,
    opportunityType: normalized.opportunityType,
    industryId,
    domainId,
    role: normalized.role,
    description: normalized.description,
    responsibilities: normalized.responsibilities,
    requirements: normalized.requirements,
    preferredSkills: normalized.preferredSkills,
    selectionProcess: normalized.selectionProcess,
    requiredDocuments: normalized.requiredDocuments,
    workMode: normalized.workMode,
    salaryMin: normalized.salaryMin,
    salaryMax: normalized.salaryMax,
    salaryCurrency: normalized.salaryCurrency,
    salaryPeriod: normalized.salaryPeriod,
    stipendMin: normalized.stipendMin,
    stipendMax: normalized.stipendMax,
    durationMonths: normalized.durationMonths,
    applicationStartDate: normalized.applicationStartDate,
    applicationDeadline: normalized.applicationDeadline,
    postedDate: normalized.postedDate,
    examDate: normalized.examDate,
    vacancies: normalized.vacancies,
    applicationFee: normalized.applicationFee,
    applicationUrl: normalized.applicationUrl,
    status,
    tags: normalized.tags,
    governmentCategory: normalized.governmentCategory,
    psuCategory: normalized.psuCategory,
    internshipCategory: normalized.internshipCategory,
    gateRequired: normalized.gateRequired,
    ppoAvailable: normalized.ppoAvailable,
    fraudFlags: input.fraudFlags,
    fraudScore: input.fraudScore,
    dedupeHash,
    lastVerifiedAt: new Date(),
    verifyFailures: 0,
  };

  const opportunityId = await prisma.$transaction(async (tx) => {
    let id: string;

    if (existingOpportunityId) {
      await tx.opportunity.update({ where: { id: existingOpportunityId }, data: scalarData });
      id = existingOpportunityId;
    } else {
      const created = await tx.opportunity.create({
        data: {
          ...scalarData,
          slug: uniqueSlug(
            `${normalized.title}-${normalized.organizationName}`,
            Math.random().toString(36).slice(2, 8),
          ),
        },
        select: { id: true },
      });
      id = created.id;
    }

    // Eligibility.
    if (normalized.eligibility) {
      await tx.opportunityEligibility.upsert({
        where: { opportunityId: id },
        update: normalized.eligibility,
        create: { opportunityId: id, ...normalized.eligibility },
      });
    }

    // Locations are fully replaced — the source is authoritative.
    await tx.opportunityLocation.deleteMany({ where: { opportunityId: id } });
    if (normalized.locations.length) {
      await tx.opportunityLocation.createMany({
        data: normalized.locations.map((l) => ({ ...l, opportunityId: id })),
      });
    }

    // Skills.
    await tx.opportunitySkill.deleteMany({
      where: { opportunityId: id, skillId: { notIn: skills.map((s) => s.id) } },
    });
    for (const skill of skills) {
      await tx.opportunitySkill.upsert({
        where: { opportunityId_skillId: { opportunityId: id, skillId: skill.id } },
        update: {},
        create: { opportunityId: id, skillId: skill.id, isRequired: true },
      });
    }

    // Source reference (idempotent on (sourceId, externalId)).
    await tx.opportunitySource.upsert({
      where: { sourceId_externalId: { sourceId, externalId: normalized.externalId } },
      update: {
        opportunityId: id,
        sourceUrl: normalized.sourceUrl,
        lastSeenAt: new Date(),
        lastVerifiedAt: new Date(),
        rawPayload: (input.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
      create: {
        opportunityId: id,
        sourceId,
        externalId: normalized.externalId,
        sourceUrl: normalized.sourceUrl,
        isPrimary: isPrimarySource,
        lastVerifiedAt: new Date(),
        rawPayload: (input.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Link the company to the source for the admin source view.
    if (company) {
      await tx.companySource.upsert({
        where: { sourceId_externalRef: { sourceId, externalRef: normalizeCompanyName(normalized.organizationName) } },
        update: {},
        create: {
          companyId: company.id,
          sourceId,
          externalRef: normalizeCompanyName(normalized.organizationName),
        },
      });
    }

    return id;
  });

  return { opportunityId, created: !existingOpportunityId };
}

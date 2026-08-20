import {
  type IngestionJobDto,
  type OpportunityStatus,
  type Paginated,
  type SourceConnectorDto,
} from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { uniqueSlug } from '../../lib/text';
import { invalidateCache } from '../../lib/redis';
import { toIso } from '../../lib/dates';
import { resolveSkillIds } from '../profile/skills.service';
import { opportunityInclude } from '../opportunities/opportunity.include';
import { toDetailDto } from '../opportunities/opportunity.mapper';
import { computeDedupeHash, mergeOpportunities } from '../../ingestion/dedupe';
import { runIngestion } from '../../ingestion/pipeline';
import { enqueue } from '../../queue/queues';
import type { z } from 'zod';
import type { createOpportunitySchema, updateOpportunitySchema } from '../opportunities/opportunity.schemas';

type CreateInput = z.infer<typeof createOpportunitySchema>;
type UpdateInput = z.infer<typeof updateOpportunitySchema>;

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: unknown,
): Promise<void> {
  await prisma.auditLog.create({
    data: { actorId, action, entityType, entityId, metadata: (metadata as Prisma.InputJsonValue) ?? undefined },
  });
}

/* ------------------------------------------------------------------ *
 * Opportunity management
 * ------------------------------------------------------------------ */

async function resolveTaxonomy(industrySlug?: string | null, domainSlug?: string | null) {
  const industry = industrySlug
    ? await prisma.industry.findUnique({ where: { slug: industrySlug }, select: { id: true } })
    : null;
  const domain = domainSlug
    ? await prisma.domain.findUnique({ where: { slug: domainSlug }, select: { id: true, industryId: true } })
    : null;
  return {
    industryId: industry?.id ?? domain?.industryId ?? null,
    domainId: domain?.id ?? null,
  };
}

export async function createOpportunity(actorId: string, input: CreateInput) {
  const { industryId, domainId } = await resolveTaxonomy(input.industrySlug, input.domainSlug);
  const skills = await resolveSkillIds(input.skills ?? []);

  // Manual entries are attributed to the manual source so provenance is never
  // blank — every opportunity keeps a source (requirement 53).
  const source = await prisma.sourceConnector.findUniqueOrThrow({
    where: { slug: input.sourceSlug ?? 'manual-entry' },
    select: { id: true },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      slug: uniqueSlug(`${input.title}-${input.organizationName}`, Math.random().toString(36).slice(2, 8)),
      title: input.title,
      organizationName: input.organizationName,
      companyId: input.companyId ?? null,
      opportunityType: input.opportunityType,
      industryId,
      domainId,
      role: input.role ?? null,
      description: input.description ?? '',
      responsibilities: input.responsibilities ?? [],
      requirements: input.requirements ?? [],
      preferredSkills: input.preferredSkills ?? [],
      selectionProcess: input.selectionProcess ?? [],
      requiredDocuments: input.requiredDocuments ?? [],
      workMode: input.workMode ?? 'NOT_SPECIFIED',
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: input.salaryCurrency ?? 'INR',
      salaryPeriod: input.salaryPeriod ?? null,
      stipendMin: input.stipendMin ?? null,
      stipendMax: input.stipendMax ?? null,
      durationMonths: input.durationMonths ?? null,
      applicationStartDate: input.applicationStartDate ? new Date(input.applicationStartDate) : null,
      applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null,
      postedDate: input.postedDate ? new Date(input.postedDate) : new Date(),
      examDate: input.examDate ? new Date(input.examDate) : null,
      vacancies: input.vacancies ?? null,
      applicationFee: input.applicationFee ?? null,
      applicationUrl: input.applicationUrl,
      status: input.status ?? 'VERIFIED',
      tags: input.tags ?? [],
      governmentCategory: input.governmentCategory ?? null,
      psuCategory: input.psuCategory ?? null,
      internshipCategory: input.internshipCategory ?? null,
      gateRequired: input.gateRequired ?? null,
      ppoAvailable: input.ppoAvailable ?? null,
      lastVerifiedAt: new Date(),
      createdBy: actorId,
      dedupeHash: computeDedupeHash({
        title: input.title,
        organizationName: input.organizationName,
        city: input.locations?.[0]?.city ?? null,
      }),
      ...(input.eligibility ? { eligibility: { create: input.eligibility } } : {}),
      ...(input.locations?.length
        ? {
            locations: {
              createMany: {
                data: input.locations.map((l) => ({
                  city: l.city ?? null,
                  state: l.state ?? null,
                  country: l.country ?? 'India',
                  isRemote: l.isRemote ?? false,
                })),
              },
            },
          }
        : {}),
      ...(skills.length
        ? { skills: { createMany: { data: skills.map((s) => ({ skillId: s.id, isRequired: true })) } } }
        : {}),
      sources: {
        create: {
          sourceId: source.id,
          externalId: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          sourceUrl: input.sourceUrl ?? input.applicationUrl,
          isPrimary: true,
          lastVerifiedAt: new Date(),
        },
      },
    },
    include: opportunityInclude,
  });

  await audit(actorId, 'opportunity.create', 'Opportunity', opportunity.id);
  await invalidateCache('counts:*');
  return toDetailDto(opportunity);
}

export async function updateOpportunity(actorId: string, id: string, input: UpdateInput) {
  const existing = await prisma.opportunity.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Opportunity');

  const { industryId, domainId } =
    input.industrySlug !== undefined || input.domainSlug !== undefined
      ? await resolveTaxonomy(input.industrySlug, input.domainSlug)
      : { industryId: undefined, domainId: undefined };

  await prisma.opportunity.update({
    where: { id },
    data: {
      title: input.title,
      organizationName: input.organizationName,
      companyId: input.companyId === undefined ? undefined : input.companyId,
      opportunityType: input.opportunityType,
      industryId,
      domainId,
      role: input.role === undefined ? undefined : input.role,
      description: input.description,
      responsibilities: input.responsibilities,
      requirements: input.requirements,
      preferredSkills: input.preferredSkills,
      selectionProcess: input.selectionProcess,
      requiredDocuments: input.requiredDocuments,
      workMode: input.workMode,
      salaryMin: input.salaryMin === undefined ? undefined : input.salaryMin,
      salaryMax: input.salaryMax === undefined ? undefined : input.salaryMax,
      salaryCurrency: input.salaryCurrency,
      salaryPeriod: input.salaryPeriod === undefined ? undefined : input.salaryPeriod,
      stipendMin: input.stipendMin === undefined ? undefined : input.stipendMin,
      stipendMax: input.stipendMax === undefined ? undefined : input.stipendMax,
      durationMonths: input.durationMonths === undefined ? undefined : input.durationMonths,
      applicationStartDate:
        input.applicationStartDate === undefined
          ? undefined
          : input.applicationStartDate
            ? new Date(input.applicationStartDate)
            : null,
      applicationDeadline:
        input.applicationDeadline === undefined
          ? undefined
          : input.applicationDeadline
            ? new Date(input.applicationDeadline)
            : null,
      examDate: input.examDate === undefined ? undefined : input.examDate ? new Date(input.examDate) : null,
      vacancies: input.vacancies === undefined ? undefined : input.vacancies,
      applicationFee: input.applicationFee === undefined ? undefined : input.applicationFee,
      applicationUrl: input.applicationUrl,
      status: input.status,
      tags: input.tags,
      governmentCategory: input.governmentCategory === undefined ? undefined : input.governmentCategory,
      psuCategory: input.psuCategory === undefined ? undefined : input.psuCategory,
      internshipCategory: input.internshipCategory === undefined ? undefined : input.internshipCategory,
      gateRequired: input.gateRequired === undefined ? undefined : input.gateRequired,
      ppoAvailable: input.ppoAvailable === undefined ? undefined : input.ppoAvailable,
    },
  });

  if (input.eligibility) {
    await prisma.opportunityEligibility.upsert({
      where: { opportunityId: id },
      update: input.eligibility,
      create: { opportunityId: id, ...input.eligibility },
    });
  }

  if (input.locations) {
    await prisma.opportunityLocation.deleteMany({ where: { opportunityId: id } });
    if (input.locations.length) {
      await prisma.opportunityLocation.createMany({
        data: input.locations.map((l) => ({
          opportunityId: id,
          city: l.city ?? null,
          state: l.state ?? null,
          country: l.country ?? 'India',
          isRemote: l.isRemote ?? false,
        })),
      });
    }
  }

  if (input.skills) {
    const skills = await resolveSkillIds(input.skills);
    await prisma.opportunitySkill.deleteMany({ where: { opportunityId: id } });
    if (skills.length) {
      await prisma.opportunitySkill.createMany({
        data: skills.map((s) => ({ opportunityId: id, skillId: s.id, isRequired: true })),
      });
    }
  }

  // Any content change invalidates cached per-user match scores.
  await prisma.matchScore.deleteMany({ where: { opportunityId: id } });
  await audit(actorId, 'opportunity.update', 'Opportunity', id, input);
  await invalidateCache('counts:*');

  const updated = await prisma.opportunity.findUniqueOrThrow({ where: { id }, include: opportunityInclude });
  return toDetailDto(updated);
}

export async function setOpportunityStatus(
  actorId: string,
  id: string,
  status: OpportunityStatus,
): Promise<void> {
  const result = await prisma.opportunity.updateMany({
    where: { id, deletedAt: null },
    data: {
      status,
      ...(status === 'VERIFIED' ? { lastVerifiedAt: new Date(), verifyFailures: 0 } : {}),
    },
  });
  if (result.count === 0) throw new NotFoundError('Opportunity');
  await audit(actorId, `opportunity.status.${status.toLowerCase()}`, 'Opportunity', id);
  await invalidateCache('counts:*');
}

/** Soft delete: the row is retained for audit but leaves every read path. */
export async function deleteOpportunity(actorId: string, id: string): Promise<void> {
  const result = await prisma.opportunity.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'REMOVED' },
  });
  if (result.count === 0) throw new NotFoundError('Opportunity');
  await audit(actorId, 'opportunity.delete', 'Opportunity', id);
  await invalidateCache('counts:*');
}

export async function mergeDuplicate(
  actorId: string,
  survivorId: string,
  duplicateId: string,
): Promise<void> {
  if (survivorId === duplicateId) throw new ConflictError('An opportunity cannot be merged into itself.');

  const [survivor, duplicate] = await Promise.all([
    prisma.opportunity.findFirst({ where: { id: survivorId, deletedAt: null } }),
    prisma.opportunity.findFirst({ where: { id: duplicateId, deletedAt: null } }),
  ]);
  if (!survivor || !duplicate) throw new NotFoundError('Opportunity');

  await mergeOpportunities(survivorId, duplicateId);
  await audit(actorId, 'opportunity.merge', 'Opportunity', survivorId, { duplicateId });
}

/** Candidate duplicate pairs for the admin review queue. */
export async function listDuplicateCandidates(limit = 50) {
  const groups = await prisma.opportunity.groupBy({
    by: ['dedupeHash'],
    where: { deletedAt: null, mergedIntoId: null, dedupeHash: { not: null } },
    _count: { _all: true },
    having: { dedupeHash: { _count: { gt: 1 } } },
    orderBy: { _count: { dedupeHash: 'desc' } },
    take: limit,
  });

  const hashes = groups.map((g) => g.dedupeHash).filter((h): h is string => Boolean(h));
  if (hashes.length === 0) return [];

  const rows = await prisma.opportunity.findMany({
    where: { dedupeHash: { in: hashes }, deletedAt: null, mergedIntoId: null },
    select: {
      id: true,
      title: true,
      organizationName: true,
      dedupeHash: true,
      createdAt: true,
      applicationUrl: true,
      status: true,
      sources: { select: { source: { select: { name: true, trustLevel: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byHash = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.dedupeHash!;
    byHash.set(key, [...(byHash.get(key) ?? []), row]);
  }

  return [...byHash.entries()].map(([hash, items]) => ({
    dedupeHash: hash,
    count: items.length,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      organizationName: i.organizationName,
      status: i.status,
      applicationUrl: i.applicationUrl,
      createdAt: i.createdAt.toISOString(),
      sources: i.sources.map((s) => `${s.source.name} (${s.source.trustLevel})`),
    })),
  }));
}

/** Opportunities carrying safety flags, for human review. */
export async function listFlagged(limit = 50) {
  const rows = await prisma.opportunity.findMany({
    where: { deletedAt: null, fraudFlags: { isEmpty: false } },
    include: opportunityInclude,
    orderBy: [{ fraudScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return rows.map((row) => ({
    ...toDetailDto(row),
    fraudScore: row.fraudScore,
  }));
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export async function listUsers(opts: { q?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(opts.q
      ? {
          OR: [
            { email: { contains: opts.q, mode: 'insensitive' } },
            { name: { contains: opts.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { city: true, profileCompletion: true } },
        _count: { select: { applications: true, savedOpportunities: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      emailVerified: r.emailVerified,
      city: r.profile?.city ?? null,
      profileCompletion: r.profile?.profileCompletion ?? 0,
      applications: r._count.applications,
      saved: r._count.savedOpportunities,
      createdAt: r.createdAt.toISOString(),
      lastLoginAt: toIso(r.lastLoginAt),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function setUserRole(actorId: string, userId: string, role: 'STUDENT' | 'ADMIN'): Promise<void> {
  if (actorId === userId && role === 'STUDENT') {
    // Prevents an admin locking themselves out of the panel.
    throw new ConflictError('You cannot remove your own administrator access.');
  }
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await audit(actorId, 'user.role.change', 'User', userId, { role });
}

/* ------------------------------------------------------------------ *
 * Sources & ingestion
 * ------------------------------------------------------------------ */

export async function listSources(): Promise<SourceConnectorDto[]> {
  const sources = await prisma.sourceConnector.findMany({ orderBy: { name: 'asc' } });

  const stats = await prisma.ingestionJob.groupBy({
    by: ['sourceId'],
    _sum: {
      recordsFetched: true,
      recordsCreated: true,
      recordsUpdated: true,
      recordsExpired: true,
      recordsFailed: true,
      recordsDuplicate: true,
    },
  });
  const statsBySource = new Map(stats.map((s) => [s.sourceId, s._sum]));

  return sources.map((source) => {
    const sum = statsBySource.get(source.id);
    return {
      id: source.id,
      name: source.name,
      slug: source.slug,
      kind: source.kind,
      trustLevel: source.trustLevel,
      baseUrl: source.baseUrl,
      enabled: source.enabled,
      scheduleCron: source.scheduleCron,
      rateLimitPerMinute: source.rateLimitPerMinute,
      respectsRobotsTxt: source.respectsRobotsTxt,
      lastSyncAt: toIso(source.lastSyncAt),
      lastStatus: source.lastStatus,
      config: (source.config as Record<string, unknown>) ?? {},
      stats: {
        fetched: sum?.recordsFetched ?? 0,
        created: sum?.recordsCreated ?? 0,
        updated: sum?.recordsUpdated ?? 0,
        expired: sum?.recordsExpired ?? 0,
        failed: sum?.recordsFailed ?? 0,
        duplicates: sum?.recordsDuplicate ?? 0,
      },
    };
  });
}

export async function updateSource(
  actorId: string,
  id: string,
  patch: Partial<{
    name: string;
    enabled: boolean;
    scheduleCron: string | null;
    rateLimitPerMinute: number;
    respectsRobotsTxt: boolean;
    trustLevel: 'OFFICIAL' | 'PARTNER' | 'THIRD_PARTY';
    config: Record<string, unknown>;
  }>,
): Promise<void> {
  await prisma.sourceConnector.update({
    where: { id },
    data: { ...patch, config: patch.config as Prisma.InputJsonValue | undefined },
  });
  await audit(actorId, 'source.update', 'SourceConnector', id, patch);
}

/** Triggers a run. Queued when Redis is available, inline otherwise. */
export async function triggerSourceRun(
  actorId: string,
  sourceId: string,
  opts: { sync?: boolean } = {},
): Promise<{ queued: boolean; result?: Awaited<ReturnType<typeof runIngestion>> }> {
  const source = await prisma.sourceConnector.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError('Source');

  await audit(actorId, 'source.run', 'SourceConnector', sourceId);

  if (opts.sync) {
    return { queued: false, result: await runIngestion(sourceId, { triggeredBy: `admin:${actorId}` }) };
  }

  await enqueue('ingest:source', { sourceId, triggeredBy: `admin:${actorId}` });
  return { queued: true };
}

export async function listIngestionJobs(opts: {
  sourceId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<IngestionJobDto>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where: Prisma.IngestionJobWhereInput = opts.sourceId ? { sourceId: opts.sourceId } : {};

  const [rows, total] = await Promise.all([
    prisma.ingestionJob.findMany({
      where,
      include: { source: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ingestionJob.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      sourceName: row.source.name,
      status: row.status,
      startedAt: toIso(row.startedAt),
      finishedAt: toIso(row.finishedAt),
      recordsFetched: row.recordsFetched,
      recordsCreated: row.recordsCreated,
      recordsUpdated: row.recordsUpdated,
      recordsExpired: row.recordsExpired,
      recordsDuplicate: row.recordsDuplicate,
      recordsFailed: row.recordsFailed,
      errorMessage: row.errorMessage,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getIngestionLogs(jobId: string, limit = 200) {
  const logs = await prisma.ingestionLog.findMany({
    where: { jobId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return logs.map((l) => ({
    id: l.id,
    level: l.level,
    message: l.message,
    externalId: l.externalId,
    payload: l.payload,
    createdAt: l.createdAt.toISOString(),
  }));
}

/* ------------------------------------------------------------------ *
 * Taxonomy management (requirement 4: no code change to add a domain)
 * ------------------------------------------------------------------ */

export async function createIndustry(actorId: string, name: string): Promise<{ id: string; slug: string }> {
  const slug = uniqueSlug(name, '').replace(/-$/, '');
  const industry = await prisma.industry.create({ data: { name, slug } });
  await audit(actorId, 'industry.create', 'Industry', industry.id, { name });
  // The filter UI reads a cached taxonomy; without this the new industry would
  // not appear until the cache expired, which defeats the point of being able
  // to extend the taxonomy at runtime.
  await invalidateCache('taxonomy:*');
  return { id: industry.id, slug: industry.slug };
}

export async function createDomain(
  actorId: string,
  industryId: string,
  name: string,
): Promise<{ id: string; slug: string }> {
  const industry = await prisma.industry.findUnique({ where: { id: industryId } });
  if (!industry) throw new NotFoundError('Industry');

  const baseSlug = uniqueSlug(name, '').replace(/-$/, '');
  const taken = await prisma.domain.findUnique({ where: { slug: baseSlug }, select: { id: true } });

  const domain = await prisma.domain.create({
    data: { industryId, name, slug: taken ? `${baseSlug}-${industry.slug}` : baseSlug },
  });
  await audit(actorId, 'domain.create', 'Domain', domain.id, { name, industryId });
  await invalidateCache('taxonomy:*');
  return { id: domain.id, slug: domain.slug };
}

export async function setTaxonomyActive(
  actorId: string,
  kind: 'industry' | 'domain',
  id: string,
  isActive: boolean,
): Promise<void> {
  if (kind === 'industry') {
    await prisma.industry.update({ where: { id }, data: { isActive } });
  } else {
    await prisma.domain.update({ where: { id }, data: { isActive } });
  }
  await audit(actorId, `${kind}.setActive`, kind === 'industry' ? 'Industry' : 'Domain', id, { isActive });
  await invalidateCache('taxonomy:*');
}

/* ------------------------------------------------------------------ *
 * Companies
 * ------------------------------------------------------------------ */

export async function updateCompany(
  actorId: string,
  id: string,
  patch: Partial<{
    name: string;
    website: string | null;
    careerPageUrl: string | null;
    description: string | null;
    industryName: string | null;
    companyType: string | null;
    headquarters: string | null;
    employeeCount: string | null;
    logoUrl: string | null;
    isVerified: boolean;
  }>,
): Promise<void> {
  await prisma.company.update({
    where: { id },
    data: { ...patch, companyType: patch.companyType as never },
  });
  await audit(actorId, 'company.update', 'Company', id, patch);
}

export async function deleteCompany(actorId: string, id: string): Promise<void> {
  await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actorId, 'company.delete', 'Company', id);
}

/* ------------------------------------------------------------------ *
 * System health
 * ------------------------------------------------------------------ */

export async function getSystemHealth() {
  const [dbLatency, recentFailures, queueDepth, oldestUnverified] = await Promise.all([
    (async () => {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      return Date.now() - start;
    })(),
    prisma.ingestionJob.count({
      where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    (async () => {
      const { getQueue } = await import('../../queue/queues');
      const queue = getQueue();
      if (!queue) return null;
      const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
      return counts;
    })(),
    prisma.opportunity.findFirst({
      where: { deletedAt: null, status: 'UNVERIFIED' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  return {
    database: { status: 'ok', latencyMs: dbLatency },
    ingestion: { failedJobsLast24h: recentFailures },
    queue: queueDepth ?? { status: 'not configured' },
    oldestUnverifiedAt: toIso(oldestUnverified?.createdAt ?? null),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };
}

export async function listAuditLog(limit = 100) {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
  }));
}

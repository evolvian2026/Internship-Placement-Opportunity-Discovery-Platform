import {
  DEADLINE_BUCKETS,
  OPPORTUNITY_TYPE_LABELS,
  type DeadlineGroupDto,
  type FacetBucket,
  type OpportunityDetailDto,
  type OpportunityFilters,
  type OpportunitySearchResponse,
  type OpportunitySummaryDto,
} from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { addDays, endOfDay, startOfDay } from '../../lib/dates';
import { cached } from '../../lib/redis';
import { parseNaturalLanguageQuery } from '../../engines/nlq';
import { buildProfileSnapshot } from '../profile/snapshot';
import { opportunityInclude, type OpportunityWithRelations } from './opportunity.include';
import { toDetailDto, toSummaryDto, type MapperContext } from './opportunity.mapper';
import { buildOrderBy, buildWhere } from './opportunity.filters';
import { persistScores, scoreMany } from './match.service';

const MAX_PAGE_SIZE = 50;
/** Scoring is done in memory, so cap how many rows a personalised sort touches. */
const MATCH_SORT_CANDIDATE_LIMIT = 400;

/** Per-user annotations (saved / applied / followed) for a page of results. */
async function loadUserContext(
  userId: string | undefined,
  opportunities: OpportunityWithRelations[],
): Promise<{
  saved: Set<string>;
  applications: Map<string, OpportunitySummaryDto['applicationStatus']>;
  followedCompanies: Set<string>;
}> {
  if (!userId || opportunities.length === 0) {
    return { saved: new Set(), applications: new Map(), followedCompanies: new Set() };
  }
  const ids = opportunities.map((o) => o.id);
  const companyIds = [...new Set(opportunities.map((o) => o.companyId).filter((c): c is string => Boolean(c)))];

  const [saved, applications, followed] = await Promise.all([
    prisma.savedOpportunity.findMany({
      where: { userId, opportunityId: { in: ids } },
      select: { opportunityId: true },
    }),
    prisma.application.findMany({
      where: { userId, opportunityId: { in: ids } },
      select: { opportunityId: true, status: true },
    }),
    companyIds.length
      ? prisma.followedCompany.findMany({
          where: { userId, companyId: { in: companyIds } },
          select: { companyId: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    saved: new Set(saved.map((s) => s.opportunityId)),
    applications: new Map(applications.map((a) => [a.opportunityId, a.status])),
    followedCompanies: new Set(followed.map((f) => f.companyId)),
  };
}

/**
 * Maps rows to DTOs, attaching match scores and eligibility for signed-in
 * users. Scoring happens once per batch, in memory.
 */
export async function decorate(
  opportunities: OpportunityWithRelations[],
  userId?: string,
  opts: { persist?: boolean } = {},
): Promise<OpportunitySummaryDto[]> {
  const [profile, userCtx] = await Promise.all([
    userId ? buildProfileSnapshot(userId) : Promise.resolve(null),
    loadUserContext(userId, opportunities),
  ]);

  const scores = profile ? scoreMany(profile, opportunities) : null;
  if (profile && scores && opts.persist !== false) {
    void persistScores(userId!, scores);
  }

  return opportunities.map((opportunity) => {
    const scored = scores?.get(opportunity.id);
    const ctx: MapperContext = {
      ...(scored ? { match: scored.match, eligibility: scored.eligibility } : {}),
      ...(userId
        ? {
            isSaved: userCtx.saved.has(opportunity.id),
            applicationStatus: userCtx.applications.get(opportunity.id) ?? null,
            isFollowedCompany: opportunity.companyId
              ? userCtx.followedCompanies.has(opportunity.companyId)
              : false,
          }
        : {}),
    };
    return toSummaryDto(opportunity, ctx);
  });
}

async function computeFacets(where: Prisma.OpportunityWhereInput): Promise<OpportunitySearchResponse['facets']> {
  const [byType, byWorkMode, byIndustry, byDomain, byCity, byCompanyType, bySkill] = await Promise.all([
    prisma.opportunity.groupBy({ by: ['opportunityType'], where, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ['workMode'], where, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ['industryId'], where, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ['domainId'], where, _count: { _all: true } }),
    prisma.opportunityLocation.groupBy({
      by: ['city'],
      where: { city: { not: null }, opportunity: where },
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: 20,
    }),
    prisma.opportunity.groupBy({
      by: ['companyId'],
      where: { ...where, companyId: { not: null } },
      _count: { _all: true },
      orderBy: { companyId: 'asc' },
      take: 200,
    }),
    prisma.opportunitySkill.groupBy({
      by: ['skillId'],
      where: { opportunity: where },
      _count: { _all: true },
      orderBy: { _count: { skillId: 'desc' } },
      take: 25,
    }),
  ]);

  const industryIds = byIndustry.map((r) => r.industryId).filter((id): id is string => Boolean(id));
  const domainIds = byDomain.map((r) => r.domainId).filter((id): id is string => Boolean(id));
  const skillIds = bySkill.map((r) => r.skillId);
  const companyIds = byCompanyType.map((r) => r.companyId).filter((id): id is string => Boolean(id));

  const [industries, domains, skills, companies] = await Promise.all([
    industryIds.length
      ? prisma.industry.findMany({ where: { id: { in: industryIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([]),
    domainIds.length
      ? prisma.domain.findMany({ where: { id: { in: domainIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([]),
    skillIds.length
      ? prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    companyIds.length
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, companyType: true } })
      : Promise.resolve([]),
  ]);

  const industryById = new Map(industries.map((i) => [i.id, i]));
  const domainById = new Map(domains.map((d) => [d.id, d]));
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const companyTypeById = new Map(companies.map((c) => [c.id, c.companyType]));

  const companyTypeCounts = new Map<string, number>();
  for (const row of byCompanyType) {
    const type = row.companyId ? companyTypeById.get(row.companyId) : null;
    if (!type) continue;
    companyTypeCounts.set(type, (companyTypeCounts.get(type) ?? 0) + row._count._all);
  }

  const sortDesc = (a: FacetBucket, b: FacetBucket) => b.count - a.count;

  return {
    types: byType
      .map((r) => ({
        value: r.opportunityType,
        label: OPPORTUNITY_TYPE_LABELS[r.opportunityType],
        count: r._count._all,
      }))
      .sort(sortDesc),
    industries: byIndustry
      .filter((r) => r.industryId && industryById.has(r.industryId))
      .map((r) => ({
        value: industryById.get(r.industryId!)!.slug,
        label: industryById.get(r.industryId!)!.name,
        count: r._count._all,
      }))
      .sort(sortDesc),
    domains: byDomain
      .filter((r) => r.domainId && domainById.has(r.domainId))
      .map((r) => ({
        value: domainById.get(r.domainId!)!.slug,
        label: domainById.get(r.domainId!)!.name,
        count: r._count._all,
      }))
      .sort(sortDesc)
      .slice(0, 30),
    workModes: byWorkMode
      .map((r) => ({ value: r.workMode, label: r.workMode, count: r._count._all }))
      .sort(sortDesc),
    cities: byCity
      .filter((r) => r.city)
      .map((r) => ({ value: r.city!, label: r.city!, count: r._count._all }))
      .sort(sortDesc),
    companyTypes: [...companyTypeCounts.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort(sortDesc),
    skills: bySkill
      .filter((r) => skillById.has(r.skillId))
      .map((r) => ({
        value: skillById.get(r.skillId)!.name,
        label: skillById.get(r.skillId)!.name,
        count: r._count._all,
      }))
      .sort(sortDesc),
  };
}

export interface SearchOptions {
  userId?: string;
  /** Run the free-text query through the natural-language parser first. */
  naturalLanguage?: boolean;
  includeFacets?: boolean;
  includeExpired?: boolean;
}

export async function searchOpportunities(
  rawFilters: OpportunityFilters,
  options: SearchOptions = {},
): Promise<OpportunitySearchResponse> {
  let filters = { ...rawFilters };
  let interpretation: string | undefined;
  let interpretedFilters: Partial<OpportunityFilters> | undefined;

  if (options.naturalLanguage && filters.q) {
    const parsed = parseNaturalLanguageQuery(filters.q);
    interpretation = parsed.interpretation;
    interpretedFilters = parsed.filters;

    // Explicit filters from the UI win over inferred ones — but only where the
    // caller actually set them. A key present as `undefined` (the query mapper
    // emits every key) must not erase what the parser inferred.
    const explicit = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== null),
    ) as Partial<OpportunityFilters>;

    filters = { ...parsed.filters, ...explicit, q: parsed.filters.q };
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? 20));
  const where = buildWhere(filters, { includeExpired: options.includeExpired });

  const wantsPersonalRanking =
    Boolean(options.userId) && (filters.sort === 'match' || filters.eligibleOnly || filters.minMatchScore != null);

  if (wantsPersonalRanking) {
    // Personalised ranking: pull a bounded candidate set, score it, then page.
    const candidates = await prisma.opportunity.findMany({
      where,
      include: opportunityInclude,
      orderBy: buildOrderBy('newest'),
      take: MATCH_SORT_CANDIDATE_LIMIT,
    });

    let decorated = await decorate(candidates, options.userId);

    if (filters.eligibleOnly) {
      decorated = decorated.filter((o) => o.eligibility?.verdict === 'ELIGIBLE');
    }
    if (filters.minMatchScore != null) {
      decorated = decorated.filter((o) => (o.match?.overall ?? 0) >= filters.minMatchScore!);
    }
    decorated.sort((a, b) => (b.match?.overall ?? 0) - (a.match?.overall ?? 0));

    const total = decorated.length;
    const items = decorated.slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      nextCursor: null,
      facets: options.includeFacets === false
        ? emptyFacets()
        : await computeFacets(where),
      ...(interpretedFilters ? { interpretedFilters } : {}),
      ...(interpretation ? { interpretation } : {}),
    };
  }

  const [rows, total, facets] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: opportunityInclude,
      orderBy: buildOrderBy(filters.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.opportunity.count({ where }),
    options.includeFacets === false ? Promise.resolve(emptyFacets()) : computeFacets(where),
  ]);

  const items = await decorate(rows, options.userId);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    nextCursor: rows.length === pageSize ? rows[rows.length - 1].id : null,
    facets,
    ...(interpretedFilters ? { interpretedFilters } : {}),
    ...(interpretation ? { interpretation } : {}),
  };
}

function emptyFacets(): OpportunitySearchResponse['facets'] {
  return { types: [], industries: [], domains: [], workModes: [], cities: [], companyTypes: [], skills: [] };
}

export async function getOpportunityBySlugOrId(
  slugOrId: string,
  userId?: string,
): Promise<OpportunityDetailDto> {
  const opportunity = await prisma.opportunity.findFirst({
    where: {
      OR: [{ slug: slugOrId }, { id: slugOrId }],
      deletedAt: null,
    },
    include: opportunityInclude,
  });
  if (!opportunity) throw new NotFoundError('Opportunity');

  // A merged duplicate redirects to the surviving row.
  if (opportunity.mergedIntoId) {
    return getOpportunityBySlugOrId(opportunity.mergedIntoId, userId);
  }

  const [profile, userCtx] = await Promise.all([
    userId ? buildProfileSnapshot(userId) : Promise.resolve(null),
    loadUserContext(userId, [opportunity]),
  ]);

  const scored = profile ? scoreMany(profile, [opportunity]).get(opportunity.id) : undefined;
  if (profile && scored) {
    void persistScores(userId!, new Map([[opportunity.id, scored]]));
  }

  return toDetailDto(opportunity, {
    ...(scored ? { match: scored.match, eligibility: scored.eligibility } : {}),
    ...(userId
      ? {
          isSaved: userCtx.saved.has(opportunity.id),
          applicationStatus: userCtx.applications.get(opportunity.id) ?? null,
          isFollowedCompany: opportunity.companyId
            ? userCtx.followedCompanies.has(opportunity.companyId)
            : false,
        }
      : {}),
  });
}

/** Deadline dashboard: opportunities grouped into closing-soon buckets. */
export async function getDeadlineGroups(
  userId: string | undefined,
  opts: { savedOnly?: boolean } = {},
): Promise<DeadlineGroupDto[]> {
  const now = new Date();
  const horizon = endOfDay(addDays(now, 30));

  const where: Prisma.OpportunityWhereInput = {
    deletedAt: null,
    mergedIntoId: null,
    status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON', 'UNVERIFIED'] },
    applicationDeadline: { gte: startOfDay(now), lte: horizon },
    ...(opts.savedOnly && userId
      ? { OR: [{ savedBy: { some: { userId } } }, { applications: { some: { userId } } }] }
      : {}),
  };

  const rows = await prisma.opportunity.findMany({
    where,
    include: opportunityInclude,
    orderBy: { applicationDeadline: 'asc' },
    take: 200,
  });

  const decorated = await decorate(rows, userId);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const groups: DeadlineGroupDto[] = DEADLINE_BUCKETS.map((bucket) => ({
    bucket: bucket.id,
    label: bucket.label,
    items: [],
  }));

  for (const item of decorated) {
    const row = byId.get(item.id);
    if (!row?.applicationDeadline) continue;
    const days = Math.ceil(
      (startOfDay(row.applicationDeadline).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000),
    );
    // Assign to the tightest bucket the deadline falls into.
    const bucket = DEADLINE_BUCKETS.find((b) => days <= b.days);
    if (!bucket) continue;
    groups.find((g) => g.bucket === bucket.id)!.items.push(item);
  }

  return groups.filter((g) => g.items.length > 0);
}

/** Cached counts powering the public landing pages. */
export async function getCategoryCounts(): Promise<Record<string, number>> {
  return cached('counts:categories', 300, async () => {
    const base = buildWhere({});
    const rows = await prisma.opportunity.groupBy({
      by: ['opportunityType'],
      where: base,
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.opportunityType, r._count._all]));
  });
}

/**
 * Recomputes and caches this user's match scores across the active catalogue.
 * Bounded so a single request cannot scan a million rows.
 */
export async function recomputeUserMatches(userId: string, limit = 1000): Promise<number> {
  const profile = await buildProfileSnapshot(userId);
  if (!profile) return 0;

  const rows = await prisma.opportunity.findMany({
    where: buildWhere({}),
    include: opportunityInclude,
    orderBy: [{ postedDate: { sort: 'desc', nulls: 'last' } }],
    take: limit,
  });

  const scores = scoreMany(profile, rows);
  await persistScores(userId, scores);
  return scores.size;
}

import { COMPANY_TYPES, type CompanySummaryDto, type CompanyType, type Paginated } from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { opportunityInclude } from '../opportunities/opportunity.include';
import { toCompanySummary } from '../opportunities/opportunity.mapper';
import { decorate } from '../opportunities/opportunity.service';
import { LIVE_OPPORTUNITY } from '../opportunities/opportunity.constants';

export interface CompanyListItem extends CompanySummaryDto {
  openOpportunities: number;
  headquarters: string | null;
  employeeCount: string | null;
  followerCount: number;
}

export interface CompanyFilters {
  q?: string;
  companyTypes?: CompanyType[];
  industries?: string[];
  page?: number;
  pageSize?: number;
  /** Only companies that currently have at least one live opportunity. */
  hiringOnly?: boolean;
}

/** Opportunities that count as "open" on a company card. */
const OPEN_OPPORTUNITY_FILTER: Prisma.OpportunityWhereInput = {
  ...LIVE_OPPORTUNITY,
  OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
};

export async function listCompanies(
  filters: CompanyFilters,
  userId?: string,
): Promise<Paginated<CompanyListItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 24));

  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
    ...(filters.q
      ? { name: { contains: filters.q, mode: 'insensitive' } }
      : {}),
    ...(filters.companyTypes?.length ? { companyType: { in: filters.companyTypes } } : {}),
    ...(filters.industries?.length ? { industryName: { in: filters.industries } } : {}),
    ...(filters.hiringOnly ? { opportunities: { some: OPEN_OPPORTUNITY_FILTER } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ opportunities: { _count: 'desc' } }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { followers: true } } },
    }),
    prisma.company.count({ where }),
  ]);

  const ids = rows.map((r) => r.id);

  const [openCounts, followed] = await Promise.all([
    ids.length
      ? prisma.opportunity.groupBy({
          by: ['companyId'],
          where: { companyId: { in: ids }, ...OPEN_OPPORTUNITY_FILTER },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    userId && ids.length
      ? prisma.followedCompany.findMany({
          where: { userId, companyId: { in: ids } },
          select: { companyId: true },
        })
      : Promise.resolve([]),
  ]);

  const openByCompany = new Map(openCounts.map((c) => [c.companyId!, c._count._all]));
  const followedSet = new Set(followed.map((f) => f.companyId));

  return {
    items: rows.map((row) => ({
      ...toCompanySummary(row, userId ? followedSet.has(row.id) : undefined)!,
      openOpportunities: openByCompany.get(row.id) ?? 0,
      headquarters: row.headquarters,
      employeeCount: row.employeeCount,
      followerCount: row._count.followers,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCompany(slugOrId: string, userId?: string) {
  const company = await prisma.company.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }], deletedAt: null },
    include: { _count: { select: { followers: true } } },
  });
  if (!company) throw new NotFoundError('Company');

  const [opportunities, isFollowed, openCount] = await Promise.all([
    prisma.opportunity.findMany({
      where: { companyId: company.id, ...OPEN_OPPORTUNITY_FILTER },
      include: opportunityInclude,
      orderBy: [{ postedDate: { sort: 'desc', nulls: 'last' } }],
      take: 50,
    }),
    userId
      ? prisma.followedCompany.findUnique({
          where: { userId_companyId: { userId, companyId: company.id } },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.opportunity.count({ where: { companyId: company.id, ...OPEN_OPPORTUNITY_FILTER } }),
  ]);

  return {
    ...toCompanySummary(company, userId ? Boolean(isFollowed) : undefined)!,
    description: company.description,
    headquarters: company.headquarters,
    employeeCount: company.employeeCount,
    careerPageUrl: company.careerPageUrl,
    isVerified: company.isVerified,
    followerCount: company._count.followers,
    openOpportunities: openCount,
    opportunities: await decorate(opportunities, userId, { persist: false }),
  };
}

export async function followCompany(userId: string, companyId: string): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    select: { id: true },
  });
  if (!company) throw new NotFoundError('Company');

  await prisma.followedCompany.upsert({
    where: { userId_companyId: { userId, companyId } },
    update: {},
    create: { userId, companyId },
  });
}

export async function unfollowCompany(userId: string, companyId: string): Promise<void> {
  await prisma.followedCompany.deleteMany({ where: { userId, companyId } });
}

export async function listFollowed(userId: string): Promise<CompanyListItem[]> {
  const rows = await prisma.followedCompany.findMany({
    where: { userId },
    include: { company: { include: { _count: { select: { followers: true } } } } },
    orderBy: { createdAt: 'desc' },
  });

  const ids = rows.map((r) => r.companyId);
  const openCounts = ids.length
    ? await prisma.opportunity.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids }, ...OPEN_OPPORTUNITY_FILTER },
        _count: { _all: true },
      })
    : [];
  const openByCompany = new Map(openCounts.map((c) => [c.companyId!, c._count._all]));

  return rows.map((row) => ({
    ...toCompanySummary(row.company, true)!,
    openOpportunities: openByCompany.get(row.companyId) ?? 0,
    headquarters: row.company.headquarters,
    employeeCount: row.company.employeeCount,
    followerCount: row.company._count.followers,
  }));
}

export { COMPANY_TYPES };

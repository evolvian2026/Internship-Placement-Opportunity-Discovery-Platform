import { EXPERIENCE_BANDS, PUBLIC_STATUSES, type OpportunityFilters } from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { addDays, endOfDay, startOfDay } from '../../lib/dates';

/**
 * Compiles the public filter object into a Prisma `where` clause.
 *
 * Everything here is indexed (see schema `@@index` declarations) so the query
 * stays fast against a million-row table.
 */
export function buildWhere(
  filters: OpportunityFilters,
  opts: { includeExpired?: boolean; now?: Date } = {},
): Prisma.OpportunityWhereInput {
  const now = opts.now ?? new Date();
  const and: Prisma.OpportunityWhereInput[] = [
    // Soft-deleted rows and rows merged into a duplicate never surface.
    { deletedAt: null },
    { mergedIntoId: null },
  ];

  if (filters.statuses?.length) {
    and.push({ status: { in: filters.statuses } });
  } else {
    and.push({ status: { in: opts.includeExpired ? [...PUBLIC_STATUSES, 'EXPIRED'] : [...PUBLIC_STATUSES] } });
  }

  if (!opts.includeExpired) {
    // A posting with no published deadline stays visible until verification
    // removes it; one with a past deadline never does.
    and.push({ OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: startOfDay(now) } }] });
  }

  if (filters.types?.length) and.push({ opportunityType: { in: filters.types } });

  if (filters.industries?.length) {
    and.push({ industry: { OR: [{ name: { in: filters.industries } }, { slug: { in: filters.industries } }] } });
  }
  if (filters.domains?.length) {
    and.push({ domain: { OR: [{ name: { in: filters.domains } }, { slug: { in: filters.domains } }] } });
  }

  if (filters.skills?.length) {
    and.push({ skills: { some: { skill: { name: { in: filters.skills } } } } });
  }

  if (filters.companyIds?.length) and.push({ companyId: { in: filters.companyIds } });
  if (filters.companyTypes?.length) and.push({ company: { companyType: { in: filters.companyTypes } } });

  if (filters.workModes?.length) and.push({ workMode: { in: filters.workModes } });

  if (filters.cities?.length) {
    and.push({
      locations: {
        some: {
          OR: filters.cities.map((city) => ({ city: { equals: city, mode: 'insensitive' as const } })),
        },
      },
    });
  }
  if (filters.states?.length) {
    and.push({
      locations: {
        some: {
          OR: filters.states.map((state) => ({ state: { equals: state, mode: 'insensitive' as const } })),
        },
      },
    });
  }
  if (filters.countries?.length) {
    and.push({
      locations: {
        some: {
          OR: filters.countries.map((c) => ({ country: { equals: c, mode: 'insensitive' as const } })),
        },
      },
    });
  }

  if (filters.degrees?.length) {
    // A posting that lists no degrees is open to all, so it must not be
    // excluded by a degree filter.
    and.push({
      OR: [
        { eligibility: { degrees: { hasSome: filters.degrees } } },
        { eligibility: { degrees: { isEmpty: true } } },
        { eligibility: null },
      ],
    });
  }

  if (filters.branches?.length) {
    and.push({
      OR: [
        { eligibility: { branches: { hasSome: filters.branches } } },
        { eligibility: { branches: { isEmpty: true } } },
        { eligibility: null },
      ],
    });
  }

  if (filters.graduationYears?.length) {
    and.push({
      OR: [
        { eligibility: { graduationYears: { hasSome: filters.graduationYears } } },
        { eligibility: { graduationYears: { isEmpty: true } } },
        { eligibility: null },
      ],
    });
  }

  if (filters.experienceBands?.length) {
    const ranges = EXPERIENCE_BANDS.filter((b) => filters.experienceBands!.includes(b.id));
    if (ranges.length) {
      and.push({
        OR: ranges.map((band) => ({
          eligibility: {
            AND: [
              // Posting's minimum must be within the requested band.
              { OR: [{ minExperienceYears: null }, { minExperienceYears: { lte: band.maxYears ?? 99 } }] },
              ...(band.maxYears === null
                ? []
                : [{ OR: [{ maxExperienceYears: null }, { maxExperienceYears: { gte: band.minYears } }] }]),
            ],
          },
        })),
      });
    }
  }

  if (filters.minSalary != null) {
    and.push({
      OR: [
        { salaryMax: { gte: filters.minSalary } },
        { salaryMin: { gte: filters.minSalary } },
        { stipendMax: { gte: filters.minSalary } },
        { stipendMin: { gte: filters.minSalary } },
      ],
    });
  }
  if (filters.maxSalary != null) {
    and.push({ OR: [{ salaryMin: { lte: filters.maxSalary } }, { salaryMin: null }] });
  }

  if (filters.deadlineWithinDays != null) {
    and.push({
      applicationDeadline: {
        gte: startOfDay(now),
        lte: endOfDay(addDays(now, filters.deadlineWithinDays)),
      },
    });
  }

  if (filters.postedWithinDays != null) {
    and.push({ postedDate: { gte: startOfDay(addDays(now, -filters.postedWithinDays)) } });
  }

  if (filters.governmentCategories?.length) {
    and.push({ governmentCategory: { in: filters.governmentCategories } });
  }
  if (filters.psuCategories?.length) and.push({ psuCategory: { in: filters.psuCategories } });
  if (filters.internshipCategories?.length) {
    and.push({ internshipCategory: { in: filters.internshipCategories } });
  }

  if (filters.q) {
    const terms = filters.q.split(/\s+/).filter(Boolean).slice(0, 8);
    for (const term of terms) {
      and.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { organizationName: { contains: term, mode: 'insensitive' } },
          { role: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { tags: { has: term } },
          { skills: { some: { skill: { name: { contains: term, mode: 'insensitive' } } } } },
        ],
      });
    }
  }

  return { AND: and };
}

export function buildOrderBy(
  sort: OpportunityFilters['sort'],
): Prisma.OpportunityOrderByWithRelationInput[] {
  switch (sort) {
    case 'deadline':
      // Postings without a deadline sort last rather than first.
      return [{ applicationDeadline: { sort: 'asc', nulls: 'last' } }, { postedDate: 'desc' }];
    case 'salary':
      return [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { postedDate: 'desc' }];
    case 'newest':
      return [{ postedDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'relevance':
    case 'match':
    default:
      // Verified first, then freshest. Match sorting is applied after scoring.
      return [{ status: 'asc' }, { postedDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
  }
}

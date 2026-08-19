import type { AdminAnalyticsDto } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { cached } from '../../lib/redis';
import { addDays, startOfDay } from '../../lib/dates';
import { LIVE_OPPORTUNITY as LIVE } from '../opportunities/opportunity.constants';

/** Platform analytics (requirement 42). Cached: these are heavy aggregates. */
export async function getAdminAnalytics(): Promise<AdminAnalyticsDto> {
  return cached('analytics:admin', 120, async () => {
    const now = new Date();

    const [
      opportunities,
      activeOpportunities,
      newToday,
      newThisWeek,
      expiringSoon,
      users,
      companies,
      applications,
      byType,
      byIndustry,
      byDomain,
      byLocation,
      byCompany,
      bySkill,
      sources,
    ] = await Promise.all([
      prisma.opportunity.count({ where: { deletedAt: null } }),
      prisma.opportunity.count({ where: LIVE }),
      prisma.opportunity.count({ where: { ...LIVE, createdAt: { gte: startOfDay(now) } } }),
      prisma.opportunity.count({ where: { ...LIVE, createdAt: { gte: addDays(startOfDay(now), -7) } } }),
      prisma.opportunity.count({
        where: { ...LIVE, applicationDeadline: { gte: now, lte: addDays(now, 7) } },
      }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.application.count(),
      prisma.opportunity.groupBy({ by: ['opportunityType'], where: LIVE, _count: { _all: true } }),
      prisma.opportunity.groupBy({ by: ['industryId'], where: LIVE, _count: { _all: true } }),
      prisma.opportunity.groupBy({ by: ['domainId'], where: LIVE, _count: { _all: true } }),
      prisma.opportunityLocation.groupBy({
        by: ['city'],
        where: { city: { not: null }, opportunity: LIVE },
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: 12,
      }),
      prisma.opportunity.groupBy({
        by: ['organizationName'],
        where: LIVE,
        _count: { _all: true },
        orderBy: { _count: { organizationName: 'desc' } },
        take: 12,
      }),
      prisma.opportunitySkill.groupBy({
        by: ['skillId'],
        where: { opportunity: LIVE },
        _count: { _all: true },
        orderBy: { _count: { skillId: 'desc' } },
        take: 15,
      }),
      prisma.sourceConnector.findMany({
        select: { name: true, lastStatus: true, lastSyncAt: true, enabled: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const industryIds = byIndustry.map((r) => r.industryId).filter((id): id is string => Boolean(id));
    const domainIds = byDomain.map((r) => r.domainId).filter((id): id is string => Boolean(id));
    const skillIds = bySkill.map((r) => r.skillId);

    const [industries, domains, skills] = await Promise.all([
      industryIds.length
        ? prisma.industry.findMany({ where: { id: { in: industryIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      domainIds.length
        ? prisma.domain.findMany({ where: { id: { in: domainIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      skillIds.length
        ? prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const industryName = new Map(industries.map((i) => [i.id, i.name]));
    const domainName = new Map(domains.map((d) => [d.id, d.name]));
    const skillName = new Map(skills.map((s) => [s.id, s.name]));

    const countFor = (types: string[]): number =>
      byType.filter((r) => types.includes(r.opportunityType)).reduce((sum, r) => sum + r._count._all, 0);

    const governmentCount = countFor([
      'GOVERNMENT_JOB',
      'GOVERNMENT_INTERNSHIP',
      'PSU_JOB',
      'APPRENTICESHIP',
    ]);
    const internshipCount = countFor(['INTERNSHIP', 'GOVERNMENT_INTERNSHIP', 'RESEARCH_OPPORTUNITY']);
    const fullTimeCount = countFor(['FULL_TIME', 'TRAINEE', 'GRADUATE_PROGRAM', 'CONTRACT', 'PART_TIME']);

    const sortDesc = <T extends { count: number }>(list: T[]): T[] =>
      [...list].sort((a, b) => b.count - a.count);

    return {
      totals: {
        opportunities,
        activeOpportunities,
        newToday,
        newThisWeek,
        expiringSoon,
        users,
        companies,
        applications,
      },
      byIndustry: sortDesc(
        byIndustry
          .filter((r) => r.industryId && industryName.has(r.industryId))
          .map((r) => ({ name: industryName.get(r.industryId!)!, count: r._count._all })),
      ).slice(0, 15),
      byDomain: sortDesc(
        byDomain
          .filter((r) => r.domainId && domainName.has(r.domainId))
          .map((r) => ({ name: domainName.get(r.domainId!)!, count: r._count._all })),
      ).slice(0, 15),
      byLocation: byLocation
        .filter((r) => r.city)
        .map((r) => ({ name: r.city!, count: r._count._all })),
      byType: sortDesc(byType.map((r) => ({ name: r.opportunityType, count: r._count._all }))),
      governmentVsPrivate: [
        { name: 'Government & PSU', count: governmentCount },
        { name: 'Private', count: activeOpportunities - governmentCount },
      ],
      internshipVsFullTime: [
        { name: 'Internships', count: internshipCount },
        { name: 'Full-time & trainee', count: fullTimeCount },
      ],
      topCompanies: byCompany.map((r) => ({ name: r.organizationName, count: r._count._all })),
      topSkills: bySkill
        .filter((r) => skillName.has(r.skillId))
        .map((r) => ({ name: skillName.get(r.skillId)!, count: r._count._all })),
      ingestionHealth: sources.map((s) => ({
        sourceName: s.name,
        status: s.enabled ? (s.lastStatus ?? 'PENDING') : 'DISABLED',
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      })),
    };
  });
}

/** Data-quality view: what is incomplete or needs review. */
export async function getDataQuality() {
  return cached('analytics:quality', 120, async () => {
    const [
      total,
      missingDeadline,
      missingSalary,
      missingEligibility,
      missingSkills,
      missingLocation,
      unclassified,
      flagged,
      unverified,
      duplicates,
      staleVerification,
    ] = await Promise.all([
      prisma.opportunity.count({ where: LIVE }),
      prisma.opportunity.count({ where: { ...LIVE, applicationDeadline: null } }),
      prisma.opportunity.count({
        where: { ...LIVE, salaryMin: null, salaryMax: null, stipendMin: null, stipendMax: null },
      }),
      prisma.opportunity.count({ where: { ...LIVE, eligibility: null } }),
      prisma.opportunity.count({ where: { ...LIVE, skills: { none: {} } } }),
      prisma.opportunity.count({ where: { ...LIVE, locations: { none: {} } } }),
      prisma.opportunity.count({ where: { ...LIVE, OR: [{ industryId: null }, { domainId: null }] } }),
      prisma.opportunity.count({ where: { deletedAt: null, fraudFlags: { isEmpty: false } } }),
      prisma.opportunity.count({ where: { deletedAt: null, status: 'UNVERIFIED' } }),
      prisma.opportunity.count({ where: { mergedIntoId: { not: null } } }),
      prisma.opportunity.count({
        where: { ...LIVE, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: addDays(new Date(), -7) } }] },
      }),
    ]);

    const pct = (n: number): number => (total === 0 ? 0 : Math.round((n / total) * 100));

    return {
      total,
      issues: [
        { key: 'missingDeadline', label: 'No application deadline', count: missingDeadline, percent: pct(missingDeadline) },
        { key: 'missingSalary', label: 'No compensation published', count: missingSalary, percent: pct(missingSalary) },
        { key: 'missingEligibility', label: 'No eligibility criteria', count: missingEligibility, percent: pct(missingEligibility) },
        { key: 'missingSkills', label: 'No skills identified', count: missingSkills, percent: pct(missingSkills) },
        { key: 'missingLocation', label: 'No location', count: missingLocation, percent: pct(missingLocation) },
        { key: 'unclassified', label: 'Missing industry or domain', count: unclassified, percent: pct(unclassified) },
        { key: 'staleVerification', label: 'Not verified in 7 days', count: staleVerification, percent: pct(staleVerification) },
      ],
      review: { flagged, unverified, duplicates },
    };
  });
}

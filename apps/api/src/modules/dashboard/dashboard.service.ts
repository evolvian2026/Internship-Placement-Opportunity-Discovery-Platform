import type {
  CareerReadinessDto,
  CareerRecommendationDto,
  DashboardDto,
  SkillGapDto,
} from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { addDays, endOfDay, greetingFor, startOfDay } from '../../lib/dates';
import { buildRecommendations } from '../../engines/recommendations';
import { computeReadiness } from '../../engines/readiness';
import { analyzeAgainstMarket, analyzeAgainstOpportunity } from '../../engines/skillgap';
import { buildProfileSnapshot } from '../profile/snapshot';
import { opportunityInclude } from '../opportunities/opportunity.include';
import { toOpportunitySnapshot } from '../opportunities/opportunity.mapper';
import { decorate } from '../opportunities/opportunity.service';
import { toCompanySummary } from '../opportunities/opportunity.mapper';
import { NotFoundError } from '../../lib/errors';

import { LIVE_OPPORTUNITY as LIVE } from '../opportunities/opportunity.constants';

/**
 * The personalised home feed (requirements 13 and 40).
 *
 * Ranking reads from the cached `match_scores` table, so the query stays a
 * bounded indexed read rather than scoring the whole catalogue per request.
 */
export async function getDashboard(userId: string): Promise<DashboardDto> {
  const profile = await buildProfileSnapshot(userId);
  const now = new Date();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true },
  });

  // Ensure there are scores to rank by; on a cold profile this seeds them.
  const scoreCount = await prisma.matchScore.count({ where: { userId } });
  if (profile && scoreCount === 0) {
    const { recomputeUserMatches } = await import('../opportunities/opportunity.service');
    await recomputeUserMatches(userId, 300);
  }

  const [topScores, closingSoonRows, activeApplicationRows, stats] = await Promise.all([
    profile
      ? prisma.matchScore.findMany({
          where: {
            userId,
            eligibilityVerdict: { in: ['ELIGIBLE', 'NEEDS_REVIEW'] },
            opportunity: {
              ...LIVE,
              OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: startOfDay(now) } }],
            },
          },
          include: { opportunity: { include: opportunityInclude } },
          orderBy: { overall: 'desc' },
          take: 8,
        })
      : Promise.resolve([]),
    prisma.opportunity.findMany({
      where: {
        ...LIVE,
        applicationDeadline: { gte: startOfDay(now), lte: endOfDay(addDays(now, 7)) },
        ...(profile ? { OR: [{ savedBy: { some: { userId } } }, { matchScores: { some: { userId, overall: { gte: 65 } } } }] } : {}),
      },
      include: opportunityInclude,
      orderBy: { applicationDeadline: 'asc' },
      take: 6,
    }),
    prisma.application.findMany({
      where: { userId, status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
      include: { opportunity: { include: opportunityInclude }, events: { orderBy: { occurredAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    (async () => {
      const [matching, newToday, deadlinesToday, activeApplications, savedCount] = await Promise.all([
        profile
          ? prisma.matchScore.count({
              where: {
                userId,
                overall: { gte: 65 },
                eligibilityVerdict: { in: ['ELIGIBLE', 'NEEDS_REVIEW'] },
                opportunity: LIVE,
              },
            })
          : prisma.opportunity.count({ where: LIVE }),
        prisma.opportunity.count({ where: { ...LIVE, createdAt: { gte: startOfDay(now) } } }),
        prisma.opportunity.count({
          where: {
            ...LIVE,
            applicationDeadline: { gte: startOfDay(now), lte: endOfDay(now) },
            OR: [{ savedBy: { some: { userId } } }, { applications: { some: { userId } } }],
          },
        }),
        prisma.application.count({
          where: { userId, status: { notIn: ['REJECTED', 'WITHDRAWN', 'SAVED'] } },
        }),
        prisma.savedOpportunity.count({ where: { userId } }),
      ]);
      return { matching, newToday, deadlinesToday, activeApplications, savedCount };
    })(),
  ]);

  // Fall back to the freshest live opportunities when the user has no profile.
  const recommendedRows = topScores.length
    ? topScores.map((s) => s.opportunity)
    : await prisma.opportunity.findMany({
        where: LIVE,
        include: opportunityInclude,
        orderBy: [{ postedDate: { sort: 'desc', nulls: 'last' } }],
        take: 8,
      });

  const [recommended, closingSoon] = await Promise.all([
    decorate(recommendedRows, userId, { persist: false }),
    decorate(closingSoonRows, userId, { persist: false }),
  ]);

  const applicationSummaries = await decorate(
    activeApplicationRows.map((a) => a.opportunity),
    userId,
    { persist: false },
  );
  const summaryById = new Map(applicationSummaries.map((s) => [s.id, s]));

  const [readiness, skillGap] = await Promise.all([
    getReadiness(userId),
    profile
      ? Promise.resolve(
          analyzeAgainstMarket(profile, recommendedRows.map(toOpportunitySnapshot)),
        )
      : Promise.resolve(null),
  ]);

  return {
    greeting: greetingFor(now),
    user: { name: user.name, profileCompletion: profile?.profileCompletion ?? 0 },
    stats: {
      matchingOpportunities: stats.matching,
      newToday: stats.newToday,
      deadlinesToday: stats.deadlinesToday,
      activeApplications: stats.activeApplications,
      savedCount: stats.savedCount,
    },
    recommended,
    closingSoon,
    activeApplications: activeApplicationRows.map((row) => ({
      id: row.id,
      opportunity: summaryById.get(row.opportunityId)!,
      status: row.status,
      notes: row.notes,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      interviewDate: row.interviewDate?.toISOString() ?? null,
      followUpDate: row.followUpDate?.toISOString() ?? null,
      recruiterName: row.recruiterName,
      recruiterEmail: row.recruiterEmail,
      recruiterPhone: row.recruiterPhone,
      referenceNumber: row.referenceNumber,
      documents: row.documents,
      events: row.events.map((e) => ({
        id: e.id,
        status: e.status,
        note: e.note,
        occurredAt: e.occurredAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    recommendedSkills: skillGap?.recommendedLearning.map((r) => ({ name: r.skill, reason: r.reason })) ?? [],
    readiness,
  };
}

export async function getReadiness(userId: string): Promise<CareerReadinessDto> {
  const profile = await buildProfileSnapshot(userId);

  const [applicationCount, interviewCount, savedCount, activeResume] = await Promise.all([
    prisma.application.count({ where: { userId, status: { not: 'SAVED' } } }),
    prisma.application.count({
      where: { userId, status: { in: ['INTERVIEW', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW', 'OFFER'] } },
    }),
    prisma.savedOpportunity.count({ where: { userId } }),
    prisma.resume.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      select: { extractedData: true },
    }),
  ]);

  const certifications =
    (activeResume?.extractedData as { certifications?: string[] } | null)?.certifications ?? [];

  return computeReadiness({
    profile: profile ?? {
      userId,
      name: '',
      city: null,
      state: null,
      country: null,
      dateOfBirth: null,
      yearsOfExperience: 0,
      skills: [],
      education: [],
      experienceCount: 0,
      projectCount: 0,
      internshipCount: 0,
      preferences: {
        desiredRoles: [],
        desiredIndustries: [],
        preferredLocations: [],
        remotePreference: 'ANY',
        minSalaryExpectation: null,
        opportunityPreference: 'ANY',
        sectorPreference: 'ANY',
        willingToRelocate: true,
      },
      profileCompletion: 0,
      hasResume: false,
    },
    certificationCount: certifications.length,
    applicationCount,
    interviewCount,
    savedCount,
  });
}

/** Skill gap against one opportunity, or against the user's matched market. */
export async function getSkillGap(userId: string, opportunityId?: string): Promise<SkillGapDto> {
  const profile = await buildProfileSnapshot(userId);
  if (!profile) {
    return { matchPercent: 0, haveSkills: [], missingSkills: [], recommendedLearning: [] };
  }

  if (opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null },
      include: opportunityInclude,
    });
    if (!opportunity) throw new NotFoundError('Opportunity');
    return analyzeAgainstOpportunity(profile, toOpportunitySnapshot(opportunity));
  }

  // Against the user's own matched market: their top-scoring live opportunities.
  const scores = await prisma.matchScore.findMany({
    where: { userId, opportunity: LIVE },
    include: { opportunity: { include: opportunityInclude } },
    orderBy: { overall: 'desc' },
    take: 60,
  });

  const rows = scores.length
    ? scores.map((s) => s.opportunity)
    : await prisma.opportunity.findMany({ where: LIVE, include: opportunityInclude, take: 60 });

  const targetRole = profile.preferences.desiredRoles[0];
  return analyzeAgainstMarket(profile, rows.map(toOpportunitySnapshot), targetRole);
}

export async function getCareerRecommendations(userId: string): Promise<CareerRecommendationDto> {
  const profile = await buildProfileSnapshot(userId);
  if (!profile) {
    return { roles: [], skills: [], industries: [], companies: [], certifications: [], projects: [] };
  }

  const scores = await prisma.matchScore.findMany({
    where: { userId, opportunity: LIVE },
    include: { opportunity: { include: opportunityInclude } },
    orderBy: { overall: 'desc' },
    take: 120,
  });

  const rows = scores.length
    ? scores.map((s) => s.opportunity)
    : await prisma.opportunity.findMany({ where: LIVE, include: opportunityInclude, take: 120 });

  const matchScores = new Map(scores.map((s) => [s.opportunityId, s.overall]));
  const base = buildRecommendations({
    profile,
    opportunities: rows.map(toOpportunitySnapshot),
    matchScores,
  });

  // Companies are recommended from the evidence set, ranked by how many of the
  // user's strong matches they account for.
  const companyHits = new Map<string, number>();
  for (const row of rows) {
    if (!row.companyId) continue;
    const score = matchScores.get(row.id) ?? 0;
    if (score < 60) continue;
    companyHits.set(row.companyId, (companyHits.get(row.companyId) ?? 0) + 1);
  }

  const topCompanyIds = [...companyHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

  const companies = topCompanyIds.length
    ? await prisma.company.findMany({ where: { id: { in: topCompanyIds } } })
    : [];

  // Persist so the assistant and the dashboard share one computed view.
  await prisma.careerRecommendation.upsert({
    where: { userId },
    update: { payload: base as unknown as object, computedAt: new Date() },
    create: { userId, payload: base as unknown as object },
  });

  return {
    ...base,
    companies: companies.map((c) => toCompanySummary(c)!),
  };
}

import {
  APPLICATION_PIPELINE,
  APPLICATION_TERMINAL,
  type ApplicationDto,
  type ApplicationStatus,
  type Paginated,
  type UserAnalyticsDto,
} from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { toIso } from '../../lib/dates';
import { opportunityInclude } from '../opportunities/opportunity.include';
import { decorate } from '../opportunities/opportunity.service';
import { z } from 'zod';
import type { updateApplicationSchema } from './application.schemas';

type UpdateInput = z.infer<typeof updateApplicationSchema>;

const applicationInclude = {
  opportunity: { include: opportunityInclude },
  events: { orderBy: { occurredAt: 'asc' } },
} satisfies Prisma.ApplicationInclude;

type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

async function toDto(rows: ApplicationRow[], userId: string): Promise<ApplicationDto[]> {
  // Decorate opportunities once for the whole batch so match scoring is
  // computed a single time rather than per row.
  const summaries = await decorate(
    rows.map((r) => r.opportunity),
    userId,
    { persist: false },
  );
  const summaryById = new Map(summaries.map((s) => [s.id, s]));

  return rows.map((row) => ({
    id: row.id,
    opportunity: summaryById.get(row.opportunityId)!,
    status: row.status,
    notes: row.notes,
    appliedAt: toIso(row.appliedAt),
    interviewDate: toIso(row.interviewDate),
    followUpDate: toIso(row.followUpDate),
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
  }));
}

export async function listApplications(
  userId: string,
  opts: { statuses?: ApplicationStatus[]; page?: number; pageSize?: number } = {},
): Promise<Paginated<ApplicationDto>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const where: Prisma.ApplicationWhereInput = {
    userId,
    ...(opts.statuses?.length ? { status: { in: opts.statuses } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: applicationInclude,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.application.count({ where }),
  ]);

  return {
    items: await toDto(rows, userId),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** The tracker board: applications grouped by pipeline stage. */
export async function getPipeline(userId: string): Promise<{ status: ApplicationStatus; label: string; items: ApplicationDto[] }[]> {
  const rows = await prisma.application.findMany({
    where: { userId },
    include: applicationInclude,
    orderBy: { updatedAt: 'desc' },
    take: 300,
  });
  const dtos = await toDto(rows, userId);

  const stages = [...APPLICATION_PIPELINE, ...APPLICATION_TERMINAL];
  return stages.map((status) => ({
    status,
    label: status
      .split('_')
      .map((w) => w[0] + w.slice(1).toLowerCase())
      .join(' '),
    items: dtos.filter((d) => d.status === status),
  }));
}

export async function getApplication(userId: string, id: string): Promise<ApplicationDto> {
  const row = await prisma.application.findFirst({
    where: { id, userId },
    include: applicationInclude,
  });
  if (!row) throw new NotFoundError('Application');
  return (await toDto([row], userId))[0];
}

export async function createApplication(
  userId: string,
  input: { opportunityId: string; status?: ApplicationStatus; notes?: string | null },
): Promise<ApplicationDto> {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw new NotFoundError('Opportunity');

  const existing = await prisma.application.findUnique({
    where: { userId_opportunityId: { userId, opportunityId: input.opportunityId } },
  });
  if (existing) throw new ConflictError('You are already tracking this opportunity.');

  const status = input.status ?? 'SAVED';
  const row = await prisma.application.create({
    data: {
      userId,
      opportunityId: input.opportunityId,
      status,
      notes: input.notes ?? null,
      appliedAt: status === 'APPLIED' ? new Date() : null,
      events: { create: { status, note: 'Tracking started' } },
    },
    include: applicationInclude,
  });

  return (await toDto([row], userId))[0];
}

export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateInput,
): Promise<ApplicationDto> {
  const existing = await prisma.application.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Application');

  const statusChanged = input.status != null && input.status !== existing.status;

  const row = await prisma.application.update({
    where: { id },
    data: {
      status: input.status,
      notes: input.notes === undefined ? undefined : input.notes,
      // Stamp the applied date automatically the first time the user marks it.
      appliedAt:
        input.appliedAt !== undefined
          ? input.appliedAt
            ? new Date(input.appliedAt)
            : null
          : statusChanged && input.status === 'APPLIED' && !existing.appliedAt
            ? new Date()
            : undefined,
      interviewDate:
        input.interviewDate === undefined
          ? undefined
          : input.interviewDate
            ? new Date(input.interviewDate)
            : null,
      followUpDate:
        input.followUpDate === undefined
          ? undefined
          : input.followUpDate
            ? new Date(input.followUpDate)
            : null,
      recruiterName: input.recruiterName === undefined ? undefined : input.recruiterName,
      recruiterEmail: input.recruiterEmail === undefined ? undefined : input.recruiterEmail,
      recruiterPhone: input.recruiterPhone === undefined ? undefined : input.recruiterPhone,
      referenceNumber: input.referenceNumber === undefined ? undefined : input.referenceNumber,
      documents: input.documents,
      ...(statusChanged
        ? { events: { create: { status: input.status!, note: input.eventNote ?? null } } }
        : {}),
    },
    include: applicationInclude,
  });

  return (await toDto([row], userId))[0];
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const result = await prisma.application.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw new NotFoundError('Application');
}

/* ------------------------------------------------------------------ *
 * Saved opportunities
 * ------------------------------------------------------------------ */

export async function saveOpportunity(
  userId: string,
  opportunityId: string,
  note?: string | null,
): Promise<{ saved: true }> {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw new NotFoundError('Opportunity');

  await prisma.savedOpportunity.upsert({
    where: { userId_opportunityId: { userId, opportunityId } },
    update: { note: note ?? undefined },
    create: { userId, opportunityId, note: note ?? null },
  });
  return { saved: true };
}

export async function unsaveOpportunity(userId: string, opportunityId: string): Promise<void> {
  await prisma.savedOpportunity.deleteMany({ where: { userId, opportunityId } });
}

export async function listSaved(
  userId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<Paginated<Awaited<ReturnType<typeof decorate>>[number]>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));

  const [rows, total] = await Promise.all([
    prisma.savedOpportunity.findMany({
      where: { userId },
      include: { opportunity: { include: opportunityInclude } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.savedOpportunity.count({ where: { userId } }),
  ]);

  const items = await decorate(rows.map((r) => r.opportunity), userId, { persist: false });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ------------------------------------------------------------------ *
 * User analytics (requirement 42)
 * ------------------------------------------------------------------ */

export async function getUserAnalytics(userId: string): Promise<UserAnalyticsDto> {
  const [byStatus, saved, applications, skillGaps] = await Promise.all([
    prisma.application.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
    prisma.savedOpportunity.count({ where: { userId } }),
    prisma.application.findMany({
      where: { userId },
      select: { status: true, createdAt: true, appliedAt: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    prisma.matchScore.findMany({
      where: { userId, missingSkills: { isEmpty: false } },
      select: { missingSkills: true },
      orderBy: { overall: 'desc' },
      take: 200,
    }),
  ]);

  const countOf = (statuses: ApplicationStatus[]): number =>
    byStatus.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);

  const appliedOrBeyond = countOf([
    'APPLIED',
    'ASSESSMENT',
    'INTERVIEW',
    'TECHNICAL_INTERVIEW',
    'HR_INTERVIEW',
    'OFFER',
    'REJECTED',
  ]);
  const interviews = countOf(['INTERVIEW', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW', 'OFFER']);
  const offers = countOf(['OFFER']);
  const rejections = countOf(['REJECTED']);
  // A response is any application that moved past "applied" in either direction.
  const responses = interviews + rejections + countOf(['ASSESSMENT']);

  const gapCounts = new Map<string, number>();
  for (const row of skillGaps) {
    for (const skill of row.missingSkills) {
      gapCounts.set(skill, (gapCounts.get(skill) ?? 0) + 1);
    }
  }

  const byDay = new Map<string, number>();
  for (const application of applications) {
    const key = (application.appliedAt ?? application.createdAt).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return {
    applications: appliedOrBeyond,
    saved,
    interviews,
    offers,
    rejections,
    responseRatePercent: appliedOrBeyond === 0 ? 0 : Math.round((responses / appliedOrBeyond) * 100),
    successRatePercent: appliedOrBeyond === 0 ? 0 : Math.round((offers / appliedOrBeyond) * 100),
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    topSkillGaps: [...gapCounts.entries()]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    applicationsOverTime: [...byDay.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

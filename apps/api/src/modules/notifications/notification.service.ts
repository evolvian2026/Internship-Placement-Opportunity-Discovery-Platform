import {
  APPLICATION_TERMINAL,
  type NotificationDto,
  type NotificationPreferencesDto,
  type NotificationType,
  type Paginated,
} from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { addDays, daysUntil, endOfDay, startOfDay, toIso } from '../../lib/dates';
import { NotFoundError } from '../../lib/errors';
import { renderEmail, sendMail } from './mailer';

/**
 * Notifications.
 *
 * Every notification carries a `dedupeKey` so a daily job can run repeatedly
 * without spamming a user with the same alert.
 */

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  dedupeKey?: string;
  /** Send an email too, when the user's preferences allow it. */
  email?: boolean;
}

function toDto(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: toIso(row.readAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps a notification type onto the preference flag that governs it. */
function isTypeEnabled(prefs: {
  newMatches: boolean;
  savedSearches: boolean;
  deadlineReminders: boolean;
  followedCompanies: boolean;
  applicationFollowUps: boolean;
  governmentAlerts: boolean;
}, type: NotificationType): boolean {
  switch (type) {
    case 'NEW_MATCHES':
      return prefs.newMatches;
    case 'SAVED_SEARCH':
      return prefs.savedSearches;
    case 'DEADLINE_REMINDER':
      return prefs.deadlineReminders;
    case 'FOLLOWED_COMPANY':
      return prefs.followedCompanies;
    case 'APPLICATION_FOLLOW_UP':
      return prefs.applicationFollowUps;
    case 'GOVERNMENT_MATCH':
      return prefs.governmentAlerts;
    case 'SYSTEM':
    default:
      return true;
  }
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationDto | null> {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId: input.userId } });

  // A user who turned this category off gets nothing — not even an in-app row.
  if (prefs && !isTypeEnabled(prefs, input.type)) return null;
  if (prefs?.frequency === 'NEVER') return null;
  if (prefs && !prefs.inAppEnabled && !prefs.emailEnabled) return null;

  const dedupeKey = input.dedupeKey ?? `${input.type}:${input.title}:${Date.now()}`;

  // The unique constraint on (userId, dedupeKey) makes repeats a no-op.
  const existing = await prisma.notification.findUnique({
    where: { userId_dedupeKey: { userId: input.userId, dedupeKey } },
  });
  if (existing) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      dedupeKey,
    },
  });

  if (input.email && prefs?.emailEnabled) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true },
    });
    if (user) {
      const link = notification.link ? `${env.PUBLIC_SITE_URL}${notification.link}` : undefined;
      const { text, html } = renderEmail(notification.title, [notification.body], link, 'View on Opportunity Discovery');
      const sent = await sendMail({ to: user.email, subject: notification.title, text, html });
      if (sent) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { emailedAt: new Date() },
        });
      }
    }
  }

  return toDto(notification);
}

export async function listNotifications(
  userId: string,
  opts: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
): Promise<Paginated<NotificationDto> & { unreadCount: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(opts.unreadOnly ? { readAt: null } : {}),
  };

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: rows.map(toDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    unreadCount,
  };
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
    if (!exists) throw new NotFoundError('Notification');
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function getPreferences(userId: string): Promise<NotificationPreferencesDto> {
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  return {
    emailEnabled: prefs.emailEnabled,
    inAppEnabled: prefs.inAppEnabled,
    browserEnabled: prefs.browserEnabled,
    frequency: prefs.frequency,
    newMatches: prefs.newMatches,
    savedSearches: prefs.savedSearches,
    deadlineReminders: prefs.deadlineReminders,
    followedCompanies: prefs.followedCompanies,
    applicationFollowUps: prefs.applicationFollowUps,
    governmentAlerts: prefs.governmentAlerts,
    deadlineLeadDays: prefs.deadlineLeadDays,
  };
}

export async function updatePreferences(
  userId: string,
  patch: Partial<NotificationPreferencesDto>,
): Promise<NotificationPreferencesDto> {
  await prisma.notificationPreference.upsert({
    where: { userId },
    update: patch,
    create: { userId, ...patch },
  });
  return getPreferences(userId);
}

/* ------------------------------------------------------------------ *
 * Scheduled notification jobs
 * ------------------------------------------------------------------ */

/**
 * Deadline reminders for saved opportunities and open applications.
 * Runs daily; the dedupe key is (opportunity, days-remaining) so a user gets
 * at most one reminder per threshold per opportunity.
 */
export async function sendDeadlineReminders(now: Date = new Date()): Promise<number> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { deadlineReminders: true, frequency: { not: 'NEVER' } },
    select: { userId: true, deadlineLeadDays: true },
  });
  if (prefs.length === 0) return 0;

  let sent = 0;

  for (const pref of prefs) {
    const horizon = endOfDay(addDays(now, pref.deadlineLeadDays));

    const rows = await prisma.opportunity.findMany({
      where: {
        deletedAt: null,
        status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON'] },
        applicationDeadline: { gte: startOfDay(now), lte: horizon },
        OR: [
          { savedBy: { some: { userId: pref.userId } } },
          {
            applications: {
              some: { userId: pref.userId, status: { notIn: [...APPLICATION_TERMINAL, 'APPLIED'] } },
            },
          },
        ],
      },
      select: { id: true, slug: true, title: true, organizationName: true, applicationDeadline: true },
      take: 50,
    });

    for (const row of rows) {
      const remaining = daysUntil(row.applicationDeadline, now);
      if (remaining == null) continue;

      const when =
        remaining <= 0 ? 'closes today' : remaining === 1 ? 'closes tomorrow' : `closes in ${remaining} days`;

      const created = await createNotification({
        userId: pref.userId,
        type: 'DEADLINE_REMINDER',
        title: `${row.title} ${when}`,
        body: `Your saved opportunity at ${row.organizationName} ${when}. Apply through the official link before the deadline.`,
        link: `/opportunities/${row.slug}`,
        dedupeKey: `deadline:${row.id}:${remaining}`,
        email: true,
      });
      if (created) sent += 1;
    }
  }

  logger.info({ sent }, 'deadline reminders dispatched');
  return sent;
}

/** Alerts users when a company they follow posts something new. */
export async function sendFollowedCompanyAlerts(now: Date = new Date()): Promise<number> {
  const since = addDays(now, -1);

  const follows = await prisma.followedCompany.findMany({
    where: { user: { notificationPreferences: { followedCompanies: true, frequency: { not: 'NEVER' } } } },
    select: { userId: true, companyId: true },
  });
  if (follows.length === 0) return 0;

  const byCompany = new Map<string, string[]>();
  for (const follow of follows) {
    byCompany.set(follow.companyId, [...(byCompany.get(follow.companyId) ?? []), follow.userId]);
  }

  let sent = 0;

  for (const [companyId, userIds] of byCompany) {
    const fresh = await prisma.opportunity.findMany({
      where: {
        companyId,
        deletedAt: null,
        mergedIntoId: null,
        createdAt: { gte: since },
        status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON'] },
      },
      select: { id: true, slug: true, title: true, organizationName: true },
      take: 10,
    });

    for (const opportunity of fresh) {
      for (const userId of userIds) {
        const score = await prisma.matchScore.findUnique({
          where: { userId_opportunityId: { userId, opportunityId: opportunity.id } },
          select: { overall: true },
        });

        const created = await createNotification({
          userId,
          type: 'FOLLOWED_COMPANY',
          title: `${opportunity.organizationName} posted: ${opportunity.title}`,
          body: score
            ? `A company you follow has a new opening. Your match: ${score.overall}%.`
            : 'A company you follow has posted a new opportunity.',
          link: `/opportunities/${opportunity.slug}`,
          dedupeKey: `followed:${opportunity.id}`,
          email: true,
        });
        if (created) sent += 1;
      }
    }
  }

  logger.info({ sent }, 'followed-company alerts dispatched');
  return sent;
}

/** Reminds users about application follow-ups due today. */
export async function sendApplicationFollowUps(now: Date = new Date()): Promise<number> {
  const due = await prisma.application.findMany({
    where: {
      followUpDate: { gte: startOfDay(now), lte: endOfDay(now) },
      status: { notIn: [...APPLICATION_TERMINAL] },
      user: { notificationPreferences: { applicationFollowUps: true, frequency: { not: 'NEVER' } } },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      opportunity: { select: { slug: true, title: true, organizationName: true } },
    },
    take: 500,
  });

  let sent = 0;
  for (const application of due) {
    const created = await createNotification({
      userId: application.userId,
      type: 'APPLICATION_FOLLOW_UP',
      title: `Follow-up due: ${application.opportunity.title}`,
      body: `Your follow-up for ${application.opportunity.organizationName} is due today. Current stage: ${application.status}.`,
      link: '/applications',
      dedupeKey: `followup:${application.id}:${startOfDay(now).toISOString().slice(0, 10)}`,
      email: true,
    });
    if (created) sent += 1;
  }

  logger.info({ sent }, 'application follow-up reminders dispatched');
  return sent;
}

/**
 * Daily digest of new opportunities that match a user's profile.
 * Uses the cached match scores, so this is a database query rather than a
 * full re-scoring pass.
 */
export async function sendNewMatchDigests(now: Date = new Date()): Promise<number> {
  const since = addDays(now, -1);

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      notificationPreferences: { newMatches: true, frequency: { in: ['REALTIME', 'DAILY', 'WEEKLY'] } },
      profile: { profileCompletion: { gte: 40 } },
    },
    select: { id: true },
    take: 5000,
  });

  let sent = 0;

  for (const user of users) {
    const matches = await prisma.matchScore.findMany({
      where: {
        userId: user.id,
        overall: { gte: 70 },
        eligibilityVerdict: { in: ['ELIGIBLE', 'NEEDS_REVIEW'] },
        opportunity: {
          createdAt: { gte: since },
          deletedAt: null,
          status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON'] },
        },
      },
      select: {
        overall: true,
        opportunity: { select: { id: true, slug: true, title: true, organizationName: true, opportunityType: true } },
      },
      orderBy: { overall: 'desc' },
      take: 10,
    });

    if (matches.length === 0) continue;

    const top = matches[0];
    const governmentMatches = matches.filter((m) =>
      m.opportunity.opportunityType.startsWith('GOVERNMENT') || m.opportunity.opportunityType === 'PSU_JOB',
    );

    const created = await createNotification({
      userId: user.id,
      type: 'NEW_MATCHES',
      title: `${matches.length} new opportunit${matches.length === 1 ? 'y' : 'ies'} match your profile`,
      body: `Top match: ${top.opportunity.title} at ${top.opportunity.organizationName} (${top.overall}% match).`,
      link: '/dashboard',
      dedupeKey: `matches:${startOfDay(now).toISOString().slice(0, 10)}`,
      email: true,
    });
    if (created) sent += 1;

    if (governmentMatches.length > 0) {
      const govTop = governmentMatches[0];
      await createNotification({
        userId: user.id,
        type: 'GOVERNMENT_MATCH',
        title: `New government opportunity matching your degree`,
        body: `${govTop.opportunity.title} — ${govTop.opportunity.organizationName}. Check the official notification for full eligibility.`,
        link: `/opportunities/${govTop.opportunity.slug}`,
        dedupeKey: `gov:${govTop.opportunity.id}`,
        email: true,
      });
    }
  }

  logger.info({ sent }, 'new-match digests dispatched');
  return sent;
}

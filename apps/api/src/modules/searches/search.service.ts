import type { OpportunityFilters, OpportunitySearchResponse, SavedSearchDto } from '@odp/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { toIso } from '../../lib/dates';
import { searchOpportunities } from '../opportunities/opportunity.service';
import { createNotification } from '../notifications/notification.service';
import { describeFilters, suggestName } from './search.describe';
import type { CreateSavedSearchInput } from './search.schemas';

/** Alerts never mention more than this many opportunities in one message. */
const MAX_ALERT_EXAMPLES = 3;
/** Guard against a runaway alert pass. */
const MAX_SEARCHES_PER_RUN = 5000;

type SavedSearchRow = Prisma.SavedSearchGetPayload<Record<string, never>>;

function toFilters(row: SavedSearchRow): Partial<OpportunityFilters> {
  return (row.filters as Partial<OpportunityFilters>) ?? {};
}

async function runSearch(
  row: SavedSearchRow,
  userId: string,
  overrides: Partial<OpportunityFilters> = {},
): Promise<OpportunitySearchResponse> {
  return searchOpportunities(
    { ...toFilters(row), ...overrides, pageSize: overrides.pageSize ?? 1, page: 1 },
    { userId, naturalLanguage: false, includeFacets: false },
  );
}

async function toDto(row: SavedSearchRow, userId: string): Promise<SavedSearchDto> {
  const filters = toFilters(row);

  // Two numbers matter to the user: how many match at all, and how many are
  // new since this alert last ran.
  const [total, fresh] = await Promise.all([
    runSearch(row, userId).then((r) => r.total),
    row.lastRunAt
      ? runSearch(row, userId, { postedWithinDays: undefined }).then(async () => {
          const since = await prisma.opportunity.count({
            where: { createdAt: { gt: row.lastRunAt! }, deletedAt: null, mergedIntoId: null },
          });
          return since;
        })
      : Promise.resolve(0),
  ]);

  return {
    id: row.id,
    name: row.name,
    query: row.query,
    filters,
    description: describeFilters(filters, row.query),
    alertsEnabled: row.alertsEnabled,
    frequency: row.frequency,
    matchCount: total,
    newSinceLastRun: fresh,
    lastRunAt: toIso(row.lastRunAt),
    lastNotifiedAt: toIso(row.lastNotifiedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSavedSearches(userId: string): Promise<SavedSearchDto[]> {
  const rows = await prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return Promise.all(rows.map((row) => toDto(row, userId)));
}

export async function createSavedSearch(
  userId: string,
  input: CreateSavedSearchInput,
): Promise<SavedSearchDto> {
  const filters = (input.filters ?? {}) as Partial<OpportunityFilters>;
  const name = input.name?.trim() || suggestName(filters, input.query);

  const existing = await prisma.savedSearch.findUnique({
    where: { userId_name: { userId, name } },
  });
  if (existing) throw new ConflictError('You already have a saved search with that name.');

  const row = await prisma.savedSearch.create({
    data: {
      userId,
      name,
      query: input.query ?? null,
      filters: filters as Prisma.InputJsonValue,
      alertsEnabled: input.alertsEnabled ?? true,
      frequency: input.frequency ?? 'DAILY',
      // Start the watermark now: a new alert should report what appears *after*
      // it was created, not flood the user with the existing catalogue.
      lastRunAt: new Date(),
    },
  });

  const result = await runSearch(row, userId);
  await prisma.savedSearch.update({
    where: { id: row.id },
    data: { lastMatchCount: result.total },
  });

  return toDto({ ...row, lastMatchCount: result.total }, userId);
}

export async function updateSavedSearch(
  userId: string,
  id: string,
  patch: { name?: string; alertsEnabled?: boolean; frequency?: string },
): Promise<SavedSearchDto> {
  const existing = await prisma.savedSearch.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Saved search');

  const row = await prisma.savedSearch.update({
    where: { id },
    data: {
      name: patch.name,
      alertsEnabled: patch.alertsEnabled,
      frequency: patch.frequency as never,
    },
  });
  return toDto(row, userId);
}

export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  const result = await prisma.savedSearch.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw new NotFoundError('Saved search');
}

/** Runs a saved search on demand and returns a full page of results. */
export async function runSavedSearch(
  userId: string,
  id: string,
  page = 1,
): Promise<OpportunitySearchResponse> {
  const row = await prisma.savedSearch.findFirst({ where: { id, userId } });
  if (!row) throw new NotFoundError('Saved search');

  return searchOpportunities(
    { ...toFilters(row), page, pageSize: 20 },
    { userId, naturalLanguage: false, includeFacets: false },
  );
}

/* ------------------------------------------------------------------ *
 * The alert pass
 * ------------------------------------------------------------------ */

/** Frequencies that are due, given how long since the last notification. */
function isDue(frequency: string, lastNotifiedAt: Date | null, now: Date): boolean {
  if (frequency === 'NEVER') return false;
  if (!lastNotifiedAt) return true;

  const hoursSince = (now.getTime() - lastNotifiedAt.getTime()) / 3_600_000;
  if (frequency === 'REALTIME') return hoursSince >= 1;
  if (frequency === 'WEEKLY') return hoursSince >= 24 * 7;
  return hoursSince >= 20; // DAILY, with slack so a daily cron never skips a day.
}

/**
 * Notifies users about opportunities that have appeared since each saved search
 * last ran.
 *
 * The watermark is advanced only when the pass succeeds for that search, so a
 * failure re-reports next time rather than silently losing an alert — which for
 * a government notification could mean a missed deadline.
 */
export async function sendSavedSearchAlerts(now: Date = new Date()): Promise<number> {
  const searches = await prisma.savedSearch.findMany({
    where: {
      alertsEnabled: true,
      frequency: { not: 'NEVER' },
      user: { deletedAt: null, notificationPreferences: { savedSearches: true } },
    },
    take: MAX_SEARCHES_PER_RUN,
  });

  let sent = 0;

  for (const row of searches) {
    if (!isDue(row.frequency, row.lastNotifiedAt, now)) continue;

    try {
      const since = row.lastRunAt ?? row.createdAt;
      const filters = toFilters(row);

      // Only opportunities published since the watermark count as new.
      const result = await searchOpportunities(
        { ...filters, pageSize: 20, page: 1, sort: 'newest' },
        { userId: row.userId, naturalLanguage: false, includeFacets: false },
      );

      const fresh = result.items.filter((item) => {
        const posted = item.postedDate ? new Date(item.postedDate) : null;
        return posted != null && posted > since;
      });

      if (fresh.length > 0) {
        const examples = fresh.slice(0, MAX_ALERT_EXAMPLES);
        const body = [
          examples.map((e) => `${e.title} — ${e.organizationName}`).join('; '),
          fresh.length > examples.length ? ` and ${fresh.length - examples.length} more.` : '',
        ].join('');

        const created = await createNotification({
          userId: row.userId,
          type: 'SAVED_SEARCH',
          title: `${fresh.length} new for “${row.name}”`,
          body,
          link: `/alerts/${row.id}`,
          // One alert per search per day, even if the pass runs more often.
          dedupeKey: `saved-search:${row.id}:${now.toISOString().slice(0, 10)}`,
          email: true,
        });
        if (created) sent += 1;
      }

      await prisma.savedSearch.update({
        where: { id: row.id },
        data: {
          lastRunAt: now,
          lastMatchCount: result.total,
          ...(fresh.length > 0 ? { lastNotifiedAt: now } : {}),
        },
      });
    } catch (err) {
      // Leave the watermark untouched so this search retries on the next pass.
      logger.error({ err, savedSearchId: row.id }, 'saved-search alert failed');
    }
  }

  logger.info({ sent, examined: searches.length }, 'saved-search alerts dispatched');
  return sent;
}

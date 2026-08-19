import type { Prisma } from '@prisma/client';

/**
 * The canonical "live opportunity" predicate.
 *
 * Defined once so the dashboard, analytics, company pages and the assistant
 * all agree on what counts as a currently-visible opportunity.
 */
export const LIVE_OPPORTUNITY: Prisma.OpportunityWhereInput = {
  deletedAt: null,
  mergedIntoId: null,
  status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON', 'UNVERIFIED'] },
};

/** Live *and* still accepting applications. */
export const OPEN_OPPORTUNITY: Prisma.OpportunityWhereInput = {
  ...LIVE_OPPORTUNITY,
  OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date(0) } }],
};

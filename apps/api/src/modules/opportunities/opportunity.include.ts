import type { Prisma } from '@prisma/client';

/** The relation set every opportunity read path uses. */
export const opportunityInclude = {
  company: true,
  industry: { select: { name: true, slug: true } },
  domain: { select: { name: true, slug: true } },
  eligibility: true,
  skills: { include: { skill: { select: { name: true } } } },
  locations: true,
  sources: {
    include: { source: { select: { id: true, name: true, trustLevel: true } } },
    orderBy: [{ isPrimary: 'desc' }, { lastSeenAt: 'desc' }],
  },
} satisfies Prisma.OpportunityInclude;

export type OpportunityWithRelations = Prisma.OpportunityGetPayload<{
  include: typeof opportunityInclude;
}>;

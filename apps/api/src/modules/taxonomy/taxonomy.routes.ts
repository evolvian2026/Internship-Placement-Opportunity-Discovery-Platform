import { Router } from 'express';
import {
  APPLICATION_STATUSES,
  COMPANY_TYPES,
  DEADLINE_BUCKETS,
  DEGREES,
  DEGREE_LABELS,
  EXPERIENCE_BANDS,
  FRESHER_CATEGORIES,
  GOVERNMENT_CATEGORIES,
  INTERNSHIP_CATEGORIES,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  PSU_CATEGORIES,
  WORK_MODES,
} from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { cached } from '../../lib/redis';
import { asyncHandler } from '../../middleware/error';

export const taxonomyRouter = Router();

/**
 * Everything the filter UI needs, in one call.
 *
 * Industries and domains come from the database, so an admin-created domain
 * appears in the filters immediately with no deployment.
 */
taxonomyRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const data = await cached('taxonomy:all', 300, async () => {
      const industries = await prisma.industry.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          domains: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true, slug: true } },
          _count: { select: { opportunities: true } },
        },
      });

      const skills = await prisma.skill.findMany({
        orderBy: { name: 'asc' },
        select: { name: true, slug: true, category: true },
        take: 500,
      });

      return {
        industries: industries.map((i) => ({
          name: i.name,
          slug: i.slug,
          opportunityCount: i._count.opportunities,
          domains: i.domains,
        })),
        skills,
        opportunityTypes: OPPORTUNITY_TYPES.map((t) => ({ value: t, label: OPPORTUNITY_TYPE_LABELS[t] })),
        degrees: DEGREES.map((d) => ({ value: d, label: DEGREE_LABELS[d] })),
        workModes: WORK_MODES,
        experienceBands: EXPERIENCE_BANDS,
        deadlineBuckets: DEADLINE_BUCKETS,
        companyTypes: COMPANY_TYPES,
        applicationStatuses: APPLICATION_STATUSES,
        governmentCategories: GOVERNMENT_CATEGORIES,
        psuCategories: PSU_CATEGORIES,
        internshipCategories: INTERNSHIP_CATEGORIES,
        fresherCategories: FRESHER_CATEGORIES,
      };
    });

    // The taxonomy changes rarely; let shared caches hold it briefly.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(data);
  }),
);

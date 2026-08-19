import { Router } from 'express';
import {
  FRESHER_TYPES,
  GOVERNMENT_TYPES,
  INTERNSHIP_TYPES,
  PSU_TYPES,
  type OpportunityFilters,
  type OpportunityType,
} from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { cached } from '../../lib/redis';
import { asyncHandler } from '../../middleware/error';
import { NotFoundError } from '../../lib/errors';

/**
 * SEO support (requirement 44).
 *
 * The web app renders the pages; this endpoint supplies the metadata, the
 * landing-page definitions and the sitemap so both stay in sync.
 */

export const seoRouter = Router();

export interface LandingPage {
  path: string;
  title: string;
  heading: string;
  description: string;
  filters: Partial<OpportunityFilters>;
}

const t = (...types: OpportunityType[]): OpportunityType[] => types;

/** The generated landing pages, each backed by a real filter set. */
export const LANDING_PAGES: LandingPage[] = [
  {
    path: '/internships',
    title: 'Internships for Students & Freshers',
    heading: 'Internships',
    description:
      'Summer, winter, research and remote internships across every industry, with eligibility and deadlines shown up front.',
    filters: { types: INTERNSHIP_TYPES },
  },
  {
    path: '/jobs',
    title: 'Jobs & Full-time Opportunities',
    heading: 'Jobs',
    description: 'Full-time, contract and part-time openings across technology, core engineering, finance and more.',
    filters: { types: t('FULL_TIME', 'PART_TIME', 'CONTRACT') },
  },
  {
    path: '/government-jobs',
    title: 'Government Jobs & Recruitment Notifications',
    heading: 'Government Jobs',
    description:
      'Central and state government recruitment, exams, internships and apprenticeships, always linked to the official notification.',
    filters: { types: GOVERNMENT_TYPES },
  },
  {
    path: '/psu-jobs',
    title: 'PSU Recruitment & Graduate Trainee Openings',
    heading: 'PSU Jobs',
    description:
      'Public sector undertaking recruitment including GATE-based graduate trainee, executive trainee and apprentice posts.',
    filters: { types: PSU_TYPES },
  },
  {
    path: '/fresher-jobs',
    title: 'Fresher Jobs & Off-Campus Drives',
    heading: 'Fresher Jobs',
    description:
      'Off-campus drives, walk-ins, graduate programmes and entry-level roles for candidates with 0–1 years of experience.',
    filters: { types: FRESHER_TYPES, experienceBands: ['FRESHER', 'ZERO_ONE'] },
  },
  {
    path: '/software-development-jobs',
    title: 'Software Development Jobs & Internships',
    heading: 'Software Development',
    description: 'Backend, frontend and full-stack engineering roles for students, freshers and early-career developers.',
    filters: { domains: ['software-development', 'web-development', 'mobile-development'] },
  },
  {
    path: '/data-analytics-jobs',
    title: 'Data Analytics Jobs & Internships',
    heading: 'Data Analytics',
    description: 'Data analyst, business intelligence and reporting roles across industries.',
    filters: { domains: ['data-analytics', 'business-intelligence'] },
  },
  {
    path: '/artificial-intelligence-jobs',
    title: 'Artificial Intelligence & Machine Learning Jobs',
    heading: 'Artificial Intelligence',
    description: 'AI, machine learning, generative AI and MLOps opportunities for students and early-career engineers.',
    filters: { domains: ['artificial-intelligence', 'machine-learning', 'generative-ai', 'mlops'] },
  },
  {
    path: '/remote-jobs',
    title: 'Remote Jobs & Internships',
    heading: 'Remote Opportunities',
    description: 'Work-from-anywhere internships and jobs, filtered to genuinely remote roles.',
    filters: { workModes: ['REMOTE'] },
  },
  {
    path: '/walk-in-drives',
    title: 'Walk-in Interviews & Recruitment Drives',
    heading: 'Walk-in Drives',
    description: 'Walk-in interviews, off-campus drives and mass hiring events with dates and venues.',
    filters: { types: t('WALK_IN', 'OFF_CAMPUS_DRIVE') },
  },
];

seoRouter.get('/landing-pages', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(LANDING_PAGES);
});

seoRouter.get(
  '/landing-pages/*',
  asyncHandler(async (req, res) => {
    const path = `/${(req.params as Record<string, string>)[0] ?? ''}`.replace(/\/+$/, '');
    const page = LANDING_PAGES.find((p) => p.path === path);
    if (!page) throw new NotFoundError('Landing page');

    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json({
      ...page,
      canonicalUrl: `${env.PUBLIC_SITE_URL}${page.path}`,
    });
  }),
);

/**
 * Sitemap data. Returns URLs in pages so a very large catalogue can be split
 * across a sitemap index rather than one oversized document.
 */
seoRouter.get(
  '/sitemap',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 5000;

    const data = await cached(`seo:sitemap:${page}`, 900, async () => {
      const [opportunities, companies, total] = await Promise.all([
        prisma.opportunity.findMany({
          where: {
            deletedAt: null,
            mergedIntoId: null,
            status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON'] },
          },
          select: { slug: true, updatedAt: true },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        page === 1
          ? prisma.company.findMany({
              where: { deletedAt: null, opportunities: { some: { deletedAt: null } } },
              select: { slug: true, updatedAt: true },
              take: 2000,
            })
          : Promise.resolve([]),
        prisma.opportunity.count({
          where: {
            deletedAt: null,
            mergedIntoId: null,
            status: { in: ['VERIFIED', 'ACTIVE', 'EXPIRING_SOON'] },
          },
        }),
      ]);

      return {
        page,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        urls: [
          ...(page === 1
            ? [
                { loc: '/', changefreq: 'daily', priority: 1.0 },
                ...LANDING_PAGES.map((p) => ({ loc: p.path, changefreq: 'daily', priority: 0.9 })),
                { loc: '/companies', changefreq: 'weekly', priority: 0.7 },
              ]
            : []),
          ...opportunities.map((o) => ({
            loc: `/opportunities/${o.slug}`,
            lastmod: o.updatedAt.toISOString(),
            changefreq: 'daily',
            priority: 0.8,
          })),
          ...companies.map((c) => ({
            loc: `/companies/${c.slug}`,
            lastmod: c.updatedAt.toISOString(),
            changefreq: 'weekly',
            priority: 0.6,
          })),
        ],
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(data);
  }),
);

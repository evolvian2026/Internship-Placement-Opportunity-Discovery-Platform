import { Router } from 'express';
import { COMPANY_TYPES, OPPORTUNITY_STATUSES, SOURCE_TRUST_LEVELS } from '@odp/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createOpportunitySchema,
  searchQuerySchema,
  updateOpportunitySchema,
} from '../opportunities/opportunity.schemas';
import { searchOpportunities } from '../opportunities/opportunity.service';
import * as service from './admin.service';
import { getAdminAnalytics, getDataQuality } from './admin.analytics';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

/* ---------------- Dashboard & analytics ---------------- */

adminRouter.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    res.json(await getAdminAnalytics());
  }),
);

adminRouter.get(
  '/data-quality',
  asyncHandler(async (_req, res) => {
    res.json(await getDataQuality());
  }),
);

adminRouter.get(
  '/system-health',
  asyncHandler(async (_req, res) => {
    res.json(await service.getSystemHealth());
  }),
);

adminRouter.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    res.json(await service.listAuditLog(req.query.limit ? Number(req.query.limit) : undefined));
  }),
);

/* ---------------- Opportunities ---------------- */

/** Admin search sees every status, including expired and removed rows. */
adminRouter.get(
  '/opportunities',
  validate(searchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(
      await searchOpportunities(req.query as never, {
        userId: undefined,
        naturalLanguage: false,
        includeExpired: true,
        includeFacets: false,
      }),
    );
  }),
);

adminRouter.post(
  '/opportunities',
  validate(createOpportunitySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createOpportunity(req.auth!.userId, req.body));
  }),
);

adminRouter.patch(
  '/opportunities/:id',
  validate(updateOpportunitySchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateOpportunity(req.auth!.userId, req.params.id, req.body));
  }),
);

adminRouter.post(
  '/opportunities/:id/status',
  validate(z.object({ status: z.enum(OPPORTUNITY_STATUSES) })),
  asyncHandler(async (req, res) => {
    await service.setOpportunityStatus(req.auth!.userId, req.params.id, req.body.status);
    res.status(204).send();
  }),
);

adminRouter.delete(
  '/opportunities/:id',
  asyncHandler(async (req, res) => {
    await service.deleteOpportunity(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

adminRouter.get(
  '/duplicates',
  asyncHandler(async (_req, res) => {
    res.json(await service.listDuplicateCandidates());
  }),
);

adminRouter.post(
  '/duplicates/merge',
  validate(z.object({ survivorId: z.string().uuid(), duplicateId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    await service.mergeDuplicate(req.auth!.userId, req.body.survivorId, req.body.duplicateId);
    res.status(204).send();
  }),
);

adminRouter.get(
  '/flagged',
  asyncHandler(async (_req, res) => {
    res.json(await service.listFlagged());
  }),
);

/* ---------------- Users ---------------- */

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.json(
      await service.listUsers({
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      }),
    );
  }),
);

adminRouter.post(
  '/users/:id/role',
  validate(z.object({ role: z.enum(['STUDENT', 'ADMIN']) })),
  asyncHandler(async (req, res) => {
    await service.setUserRole(req.auth!.userId, req.params.id, req.body.role);
    res.status(204).send();
  }),
);

/* ---------------- Sources & ingestion ---------------- */

adminRouter.get(
  '/sources',
  asyncHandler(async (_req, res) => {
    res.json(await service.listSources());
  }),
);

adminRouter.patch(
  '/sources/:id',
  validate(
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      enabled: z.boolean().optional(),
      scheduleCron: z.string().trim().max(60).nullable().optional(),
      rateLimitPerMinute: z.number().int().min(1).max(6000).optional(),
      respectsRobotsTxt: z.boolean().optional(),
      trustLevel: z.enum(SOURCE_TRUST_LEVELS).optional(),
      config: z.record(z.unknown()).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await service.updateSource(req.auth!.userId, req.params.id, req.body);
    res.status(204).send();
  }),
);

adminRouter.post(
  '/sources/:id/run',
  asyncHandler(async (req, res) => {
    const sync = req.query.sync === 'true';
    res.json(await service.triggerSourceRun(req.auth!.userId, req.params.id, { sync }));
  }),
);

adminRouter.get(
  '/ingestion/jobs',
  asyncHandler(async (req, res) => {
    res.json(
      await service.listIngestionJobs({
        sourceId: typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      }),
    );
  }),
);

adminRouter.get(
  '/ingestion/jobs/:id/logs',
  asyncHandler(async (req, res) => {
    res.json(await service.getIngestionLogs(req.params.id));
  }),
);

/* ---------------- Taxonomy ---------------- */

adminRouter.post(
  '/industries',
  validate(z.object({ name: z.string().trim().min(2).max(80) })),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createIndustry(req.auth!.userId, req.body.name));
  }),
);

adminRouter.post(
  '/domains',
  validate(z.object({ industryId: z.string().uuid(), name: z.string().trim().min(2).max(80) })),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await service.createDomain(req.auth!.userId, req.body.industryId, req.body.name),
    );
  }),
);

adminRouter.post(
  '/taxonomy/:kind/:id/active',
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    const kind = req.params.kind === 'industry' ? 'industry' : 'domain';
    await service.setTaxonomyActive(req.auth!.userId, kind, req.params.id, req.body.isActive);
    res.status(204).send();
  }),
);

/* ---------------- Companies ---------------- */

adminRouter.patch(
  '/companies/:id',
  validate(
    z.object({
      name: z.string().trim().min(2).max(160).optional(),
      website: z.string().url().max(500).nullable().optional(),
      careerPageUrl: z.string().url().max(500).nullable().optional(),
      description: z.string().trim().max(4000).nullable().optional(),
      industryName: z.string().trim().max(80).nullable().optional(),
      companyType: z.enum(COMPANY_TYPES).nullable().optional(),
      headquarters: z.string().trim().max(120).nullable().optional(),
      employeeCount: z.string().trim().max(40).nullable().optional(),
      logoUrl: z.string().url().max(500).nullable().optional(),
      isVerified: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await service.updateCompany(req.auth!.userId, req.params.id, req.body);
    res.status(204).send();
  }),
);

adminRouter.delete(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    await service.deleteCompany(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

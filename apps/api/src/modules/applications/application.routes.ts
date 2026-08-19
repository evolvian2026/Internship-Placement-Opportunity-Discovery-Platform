import { Router } from 'express';
import { APPLICATION_STATUSES } from '@odp/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createApplicationSchema,
  saveOpportunitySchema,
  updateApplicationSchema,
} from './application.schemas';
import * as service from './application.service';

export const applicationRouter = Router();
applicationRouter.use(requireAuth);

const listQuerySchema = z.object({
  statuses: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const list = Array.isArray(v) ? v : v.split(',');
      return list.filter((s): s is (typeof APPLICATION_STATUSES)[number] =>
        (APPLICATION_STATUSES as readonly string[]).includes(s),
      );
    }),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

applicationRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    res.json(await service.listApplications(req.auth!.userId, q));
  }),
);

applicationRouter.get(
  '/pipeline',
  asyncHandler(async (req, res) => {
    res.json(await service.getPipeline(req.auth!.userId));
  }),
);

applicationRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    res.json(await service.getUserAnalytics(req.auth!.userId));
  }),
);

applicationRouter.post(
  '/',
  validate(createApplicationSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createApplication(req.auth!.userId, req.body));
  }),
);

applicationRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.getApplication(req.auth!.userId, req.params.id));
  }),
);

applicationRouter.patch(
  '/:id',
  validate(updateApplicationSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateApplication(req.auth!.userId, req.params.id, req.body));
  }),
);

applicationRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteApplication(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

/* ---------------- Saved opportunities ---------------- */

export const savedRouter = Router();
savedRouter.use(requireAuth);

savedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(
      await service.listSaved(req.auth!.userId, {
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      }),
    );
  }),
);

savedRouter.post(
  '/',
  validate(saveOpportunitySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await service.saveOpportunity(req.auth!.userId, req.body.opportunityId, req.body.note),
    );
  }),
);

savedRouter.delete(
  '/:opportunityId',
  asyncHandler(async (req, res) => {
    await service.unsaveOpportunity(req.auth!.userId, req.params.opportunityId);
    res.status(204).send();
  }),
);

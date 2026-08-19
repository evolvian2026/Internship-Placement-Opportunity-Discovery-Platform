import { Router } from 'express';
import { COMPANY_TYPES } from '@odp/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as service from './company.service';

export const companyRouter = Router();

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  companyTypes: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const list = Array.isArray(v) ? v : v.split(',');
      return list.filter((t): t is (typeof COMPANY_TYPES)[number] =>
        (COMPANY_TYPES as readonly string[]).includes(t),
      );
    }),
  industries: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(',')).filter(Boolean))),
  hiringOnly: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

companyRouter.get(
  '/',
  optionalAuth,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await service.listCompanies(req.query as never, req.auth?.userId));
  }),
);

companyRouter.get(
  '/following',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.listFollowed(req.auth!.userId));
  }),
);

companyRouter.get(
  '/:slugOrId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.getCompany(req.params.slugOrId, req.auth?.userId));
  }),
);

companyRouter.post(
  '/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    await service.followCompany(req.auth!.userId, req.params.id);
    res.status(201).json({ following: true });
  }),
);

companyRouter.delete(
  '/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    await service.unfollowCompany(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

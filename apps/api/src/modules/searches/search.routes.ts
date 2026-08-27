import { Router } from 'express';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createSavedSearchSchema, updateSavedSearchSchema } from './search.schemas';
import * as service from './search.service';

export const savedSearchRouter = Router();
savedSearchRouter.use(requireAuth);

savedSearchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.listSavedSearches(req.auth!.userId));
  }),
);

savedSearchRouter.post(
  '/',
  validate(createSavedSearchSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createSavedSearch(req.auth!.userId, req.body));
  }),
);

savedSearchRouter.patch(
  '/:id',
  validate(updateSavedSearchSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateSavedSearch(req.auth!.userId, req.params.id, req.body));
  }),
);

savedSearchRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteSavedSearch(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

savedSearchRouter.get(
  '/:id/results',
  asyncHandler(async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    res.json(await service.runSavedSearch(req.auth!.userId, req.params.id, page));
  }),
);

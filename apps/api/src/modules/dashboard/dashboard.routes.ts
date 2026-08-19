import { Router } from 'express';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import * as service from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.getDashboard(req.auth!.userId));
  }),
);

dashboardRouter.get(
  '/readiness',
  asyncHandler(async (req, res) => {
    res.json(await service.getReadiness(req.auth!.userId));
  }),
);

dashboardRouter.get(
  '/skill-gap',
  asyncHandler(async (req, res) => {
    const opportunityId = typeof req.query.opportunityId === 'string' ? req.query.opportunityId : undefined;
    res.json(await service.getSkillGap(req.auth!.userId, opportunityId));
  }),
);

dashboardRouter.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    res.json(await service.getCareerRecommendations(req.auth!.userId));
  }),
);

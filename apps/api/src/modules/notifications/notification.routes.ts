import { Router } from 'express';
import { NOTIFICATION_FREQUENCIES } from '@odp/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as service from './notification.service';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(
      await service.listNotifications(req.auth!.userId, {
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
        unreadOnly: req.query.unreadOnly === 'true',
      }),
    );
  }),
);

notificationRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await service.markRead(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    res.json({ marked: await service.markAllRead(req.auth!.userId) });
  }),
);

notificationRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    res.json(await service.getPreferences(req.auth!.userId));
  }),
);

notificationRouter.put(
  '/preferences',
  validate(
    z.object({
      emailEnabled: z.boolean().optional(),
      inAppEnabled: z.boolean().optional(),
      browserEnabled: z.boolean().optional(),
      frequency: z.enum(NOTIFICATION_FREQUENCIES).optional(),
      newMatches: z.boolean().optional(),
      deadlineReminders: z.boolean().optional(),
      followedCompanies: z.boolean().optional(),
      applicationFollowUps: z.boolean().optional(),
      governmentAlerts: z.boolean().optional(),
      deadlineLeadDays: z.number().int().min(0).max(30).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(await service.updatePreferences(req.auth!.userId, req.body));
  }),
);

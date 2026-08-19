import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { assistantRateLimiter } from '../../middleware/rateLimit';
import * as service from './assistant.service';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

const askSchema = z.object({
  question: z.string().trim().min(2).max(1000),
  conversationId: z.string().uuid().optional(),
});

assistantRouter.get('/prompts', (_req, res) => {
  res.json({ prompts: service.SUGGESTED_PROMPTS });
});

assistantRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    res.json(await service.listConversations(req.auth!.userId));
  }),
);

assistantRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.getConversation(req.auth!.userId, req.params.id));
  }),
);

assistantRouter.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    await service.deleteConversation(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

assistantRouter.post(
  '/ask',
  assistantRateLimiter,
  validate(askSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.ask(req.auth!.userId, req.body.question, req.body.conversationId));
  }),
);

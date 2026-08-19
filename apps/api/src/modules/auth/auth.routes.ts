import { Router } from 'express';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';
import {
  changePasswordSchema,
  googleSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from './auth.schemas';
import * as service from './auth.service';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await service.register(req.body, req.get('user-agent') ?? undefined);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await service.login(req.body, req.get('user-agent') ?? undefined);
    res.json(result);
  }),
);

authRouter.post(
  '/google',
  authRateLimiter,
  validate(googleSchema),
  asyncHandler(async (req, res) => {
    const result = await service.loginWithGoogle(req.body.idToken, req.get('user-agent') ?? undefined);
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await service.refresh(req.body.refreshToken, req.get('user-agent') ?? undefined);
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await service.logout(req.body.refreshToken);
    res.status(204).send();
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await service.logoutAll(req.auth!.userId);
    res.status(204).send();
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authRateLimiter,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await service.changePassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.getCurrentUser(req.auth!.userId));
  }),
);

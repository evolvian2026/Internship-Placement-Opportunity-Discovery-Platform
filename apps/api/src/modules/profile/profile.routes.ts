import { Router } from 'express';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { addSkillsSchema, updateProfileSchema } from './profile.schemas';
import { addUserSkills } from './skills.service';
import * as service from './profile.service';

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.getProfile(req.auth!.userId));
  }),
);

profileRouter.put(
  '/',
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateProfile(req.auth!.userId, req.body));
  }),
);

profileRouter.post(
  '/skills',
  validate(addSkillsSchema),
  asyncHandler(async (req, res) => {
    const profile = await service.getOrCreateProfile(req.auth!.userId);
    await addUserSkills(profile.id, req.body.skills);
    res.json(await service.getProfile(req.auth!.userId));
  }),
);

profileRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const data = await service.exportUserData(req.auth!.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    res.json(data);
  }),
);

profileRouter.delete(
  '/account',
  asyncHandler(async (req, res) => {
    await service.deleteAccount(req.auth!.userId);
    res.status(204).send();
  }),
);

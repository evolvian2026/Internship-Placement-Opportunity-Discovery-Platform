import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DEGREES } from '@odp/shared';
import { env } from '../../config/env';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { uploadRateLimiter } from '../../middleware/rateLimit';
import { BadRequestError } from '../../lib/errors';
import * as service from './resume.service';

export const resumeRouter = Router();
resumeRouter.use(requireAuth);

const upload = multer({
  // In-memory: resumes are small and never touch a shared temp directory.
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_RESUME_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!service.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestError('Only PDF and DOCX resumes are supported.'));
      return;
    }
    cb(null, true);
  },
});

const applySchema = z.object({
  name: z.string().trim().min(2).max(100).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(200).optional(),
  education: z
    .array(
      z.object({
        degree: z.enum(DEGREES),
        branch: z.string().trim().max(120).nullable().optional(),
        college: z.string().trim().max(160).nullable().optional(),
        graduationYear: z.number().int().min(1970).max(2100).nullable().optional(),
        cgpa: z.number().min(0).max(10).nullable().optional(),
        percentage: z.number().min(0).max(100).nullable().optional(),
      }),
    )
    .max(10)
    .optional(),
  experience: z
    .array(
      z.object({
        kind: z.enum(['INTERNSHIP', 'JOB', 'PROJECT', 'FREELANCE']),
        title: z.string().trim().min(1).max(160),
        organization: z.string().trim().max(160).nullable().optional(),
        description: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .max(30)
    .optional(),
});

resumeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.listResumes(req.auth!.userId));
  }),
);

resumeRouter.post(
  '/',
  uploadRateLimiter,
  upload.single('resume'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError('Attach a resume file in the "resume" field.');
    res.status(201).json(await service.uploadResume(req.auth!.userId, req.file));
  }),
);

resumeRouter.get(
  '/:id/extraction',
  asyncHandler(async (req, res) => {
    res.json(await service.getExtraction(req.auth!.userId, req.params.id));
  }),
);

/** Applies the user-reviewed extraction to the profile. */
resumeRouter.post(
  '/:id/apply',
  validate(applySchema),
  asyncHandler(async (req, res) => {
    await service.applyExtraction(req.auth!.userId, req.params.id, req.body);
    res.status(204).send();
  }),
);

resumeRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const file = await service.downloadResume(req.auth!.userId, req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    // Resumes are private: never cached by a shared proxy.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.send(file.buffer);
  }),
);

resumeRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteResume(req.auth!.userId, req.params.id);
    res.status(204).send();
  }),
);

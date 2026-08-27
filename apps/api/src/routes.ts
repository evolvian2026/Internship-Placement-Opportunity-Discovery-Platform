import { Router } from 'express';
import { prisma } from './lib/prisma';
import { getRedis } from './lib/redis';
import { env } from './config/env';
import { asyncHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { resumeRouter } from './modules/resume/resume.routes';
import { opportunityRouter } from './modules/opportunities/opportunity.routes';
import { companyRouter } from './modules/companies/company.routes';
import { applicationRouter, savedRouter } from './modules/applications/application.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { assistantRouter } from './modules/assistant/assistant.routes';
import { savedSearchRouter } from './modules/searches/search.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { taxonomyRouter } from './modules/taxonomy/taxonomy.routes';
import { seoRouter } from './modules/seo/seo.routes';

export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, string> = { api: 'ok' };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'unavailable';
    }

    const redis = getRedis();
    if (redis) {
      try {
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'unavailable';
      }
    } else {
      checks.redis = 'not configured';
    }

    const healthy = checks.database === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      dataSource: env.DATA_SOURCE,
      checks,
      time: new Date().toISOString(),
    });
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/resumes', resumeRouter);
apiRouter.use('/opportunities', opportunityRouter);
apiRouter.use('/companies', companyRouter);
apiRouter.use('/applications', applicationRouter);
apiRouter.use('/saved', savedRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/assistant', assistantRouter);
apiRouter.use('/saved-searches', savedSearchRouter);
apiRouter.use('/taxonomy', taxonomyRouter);
apiRouter.use('/seo', seoRouter);
apiRouter.use('/admin', adminRouter);

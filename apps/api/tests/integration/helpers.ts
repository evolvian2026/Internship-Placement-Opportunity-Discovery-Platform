import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

export const app: Express = createApp();

/** Removes every row so each suite starts from a known state. */
export async function resetDatabase(): Promise<void> {
  // Order matters only where cascades do not cover it.
  await prisma.$transaction([
    prisma.savedSearch.deleteMany(),
    prisma.assistantMessage.deleteMany(),
    prisma.assistantConversation.deleteMany(),
    prisma.matchScore.deleteMany(),
    prisma.skillGapAnalysis.deleteMany(),
    prisma.careerRecommendation.deleteMany(),
    prisma.applicationEvent.deleteMany(),
    prisma.application.deleteMany(),
    prisma.savedOpportunity.deleteMany(),
    prisma.followedCompany.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.ingestionLog.deleteMany(),
    prisma.ingestionJob.deleteMany(),
    prisma.opportunitySource.deleteMany(),
    prisma.opportunitySkill.deleteMany(),
    prisma.opportunityLocation.deleteMany(),
    prisma.opportunityEligibility.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.companySource.deleteMany(),
    prisma.company.deleteMany(),
    prisma.sourceConnector.deleteMany(),
    prisma.userSkill.deleteMany(),
    prisma.experience.deleteMany(),
    prisma.education.deleteMany(),
    prisma.userPreference.deleteMany(),
    prisma.resume.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.domain.deleteMany(),
    prisma.industry.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
}

export async function registerUser(
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<TestUser> {
  const email = overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: overrides.name ?? 'Test Student',
      email,
      password: overrides.password ?? 'Password1',
    })
    .expect(201);

  return {
    id: res.body.user.id,
    email,
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

export async function makeAdmin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
}

/** Creates a source connector for ingestion tests. */
export async function createMockSource(config: Record<string, unknown> = { count: 12, seed: 7 }) {
  return prisma.sourceConnector.create({
    data: {
      name: 'Test Mock Source',
      slug: `mock-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'MOCK',
      trustLevel: 'PARTNER',
      enabled: true,
      config,
    },
  });
}

export { prisma, request };

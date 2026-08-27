import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runIngestion } from '../../src/ingestion/pipeline';
import { sendSavedSearchAlerts } from '../../src/modules/searches/search.service';
import {
  app, createMockSource, prisma, registerUser, request, resetDatabase, type TestUser,
} from './helpers';

describe('unlocks, near misses and saved-search alerts', () => {
  let user: TestUser;
  let sourceId: string;

  beforeAll(async () => {
    await resetDatabase();
    const source = await createMockSource({ count: 40, seed: 2026 });
    sourceId = source.id;
    await runIngestion(sourceId, { triggeredBy: 'test' });
    user = await registerUser({ name: 'Insight Tester' });
  }, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const auth = () => ({ authorization: `Bearer ${user.token}` });

  describe('profile unlocks', () => {
    it('names the field blocking the most opportunities', async () => {
      // Deliberately omit percentage and date of birth.
      await request(app)
        .put('/api/profile')
        .set(auth())
        .send({
          city: 'Bengaluru',
          yearsOfExperience: 0,
          skills: ['Python', 'SQL'],
          education: [
            {
              degree: 'B_TECH', branch: 'CSE',
              graduationYear: new Date().getFullYear(),
              cgpa: 8.2, backlogs: 0, isPrimary: true,
            },
          ],
        })
        .expect(200);

      const res = await request(app).get('/api/dashboard/unlocks').set(auth()).expect(200);

      expect(res.body.examinedCount).toBeGreaterThan(0);
      expect(res.body.unlocks.length).toBeGreaterThan(0);
      // Ordered by impact.
      const counts = res.body.unlocks.map((u: { blockedCount: number }) => u.blockedCount);
      expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a));

      const top = res.body.unlocks[0];
      expect(top.prompt).toBeTruthy();
      expect(top.href).toContain('/profile');
      expect(top.blockedCount).toBeGreaterThan(0);
    });

    it('shrinks the unresolved count once the blocking field is supplied', async () => {
      const before = await request(app).get('/api/dashboard/unlocks').set(auth()).expect(200);
      const blocker = before.body.unlocks[0];
      if (!blocker) return;

      // Fill in whatever was blocking the most.
      if (blocker.field === 'education.percentage') {
        const profile = await request(app).get('/api/profile').set(auth()).expect(200);
        await request(app)
          .put('/api/profile')
          .set(auth())
          .send({
            education: profile.body.education.map((e: Record<string, unknown>) => ({ ...e, percentage: 78 })),
          })
          .expect(200);
      } else if (blocker.field === 'profile.dateOfBirth') {
        await request(app)
          .put('/api/profile')
          .set(auth())
          .send({ dateOfBirth: new Date('2004-01-01').toISOString() })
          .expect(200);
      } else {
        return;
      }

      const after = await request(app).get('/api/dashboard/unlocks').set(auth()).expect(200);
      expect(after.body.unresolvedCount).toBeLessThan(before.body.unresolvedCount);
    });
  });

  describe('near misses', () => {
    it('reports how far short the user is, with a usable gap', async () => {
      // A profile that falls just short in more than one way.
      await request(app)
        .put('/api/profile')
        .set(auth())
        .send({
          yearsOfExperience: 0,
          dateOfBirth: new Date('2004-01-01').toISOString(),
          education: [
            {
              degree: 'B_TECH', branch: 'Mechanical',
              graduationYear: new Date().getFullYear() + 1,
              cgpa: 6.3, percentage: 60, backlogs: 2, isPrimary: true,
            },
          ],
        })
        .expect(200);

      const res = await request(app).get('/api/dashboard/near-misses').set(auth()).expect(200);

      expect(res.body.ineligibleCount).toBeGreaterThan(0);
      expect(res.body.groups.length).toBeGreaterThan(0);

      for (const group of res.body.groups) {
        expect(group.title).toBeTruthy();
        expect(group.advice.length).toBeGreaterThan(15);
        for (const item of group.items) {
          expect(item.gap.required).toBeTruthy();
          expect(item.gap.actual).toBeTruthy();
          expect(item.opportunity.id).toBeTruthy();
        }
      }

      // Actionable groups are listed before informational ones.
      const closable = res.body.groups.map((g: { closable: boolean }) => g.closable);
      expect(closable).toEqual([...closable].sort((a: boolean, b: boolean) => Number(b) - Number(a)));
    });

    it('never lists an opportunity the user is actually eligible for', async () => {
      const [near, search] = await Promise.all([
        request(app).get('/api/dashboard/near-misses').set(auth()).expect(200),
        request(app).get('/api/opportunities?eligibleOnly=true&pageSize=50').set(auth()).expect(200),
      ]);

      const eligibleIds = new Set(search.body.items.map((i: { id: string }) => i.id));
      for (const group of near.body.groups) {
        for (const item of group.items) {
          expect(eligibleIds.has(item.opportunity.id)).toBe(false);
        }
      }
    });
  });

  describe('saved searches and alerts', () => {
    let searchId: string;

    it('saves a search and describes it in plain language', async () => {
      const res = await request(app)
        .post('/api/saved-searches')
        .set(auth())
        .send({
          query: 'government jobs for BTech',
          filters: { types: ['GOVERNMENT_JOB'], degrees: ['B_TECH'] },
          frequency: 'DAILY',
        })
        .expect(201);

      searchId = res.body.id;
      expect(res.body.name).toBeTruthy();
      expect(res.body.description).toContain('Government Job');
      expect(res.body.alertsEnabled).toBe(true);
    });

    it('rejects a duplicate name', async () => {
      await request(app)
        .post('/api/saved-searches')
        .set(auth())
        .send({ name: 'government jobs for BTech', filters: {} })
        .expect(409);
    });

    it('runs the saved search on demand', async () => {
      const res = await request(app)
        .get(`/api/saved-searches/${searchId}/results`)
        .set(auth())
        .expect(200);

      for (const item of res.body.items) {
        expect(item.opportunityType).toBe('GOVERNMENT_JOB');
      }
    });

    it('alerts only about opportunities published since the watermark', async () => {
      // Nothing new yet: the watermark was set when the search was created.
      expect(await sendSavedSearchAlerts()).toBe(0);

      await prisma.savedSearch.update({
        where: { id: searchId },
        data: { lastRunAt: new Date(Date.now() - 2 * 86_400_000), lastNotifiedAt: null },
      });

      const source = await prisma.sourceConnector.findUniqueOrThrow({ where: { id: sourceId } });
      await prisma.opportunity.create({
        data: {
          slug: `alert-probe-${Date.now()}`,
          title: 'Junior Engineer Recruitment 2026',
          organizationName: 'Alert Probe Board',
          opportunityType: 'GOVERNMENT_JOB',
          applicationUrl: 'https://example.gov.in/probe/1',
          status: 'VERIFIED',
          postedDate: new Date(),
          applicationDeadline: new Date(Date.now() + 30 * 86_400_000),
          lastVerifiedAt: new Date(),
          eligibility: { create: { degrees: ['B_TECH'] } },
          sources: {
            create: {
              sourceId: source.id,
              externalId: `probe-${Date.now()}`,
              sourceUrl: 'https://example.gov.in/probe/1',
              isPrimary: true,
            },
          },
        },
      });

      expect(await sendSavedSearchAlerts()).toBe(1);

      const notifications = await prisma.notification.findMany({
        where: { userId: user.id, type: 'SAVED_SEARCH' },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toContain('new for');
      expect(notifications[0].link).toBe(`/alerts/${searchId}`);
    });

    it('does not send the same alert twice', async () => {
      expect(await sendSavedSearchAlerts()).toBe(0);
    });

    it('respects a paused alert', async () => {
      await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .set(auth())
        .send({ alertsEnabled: false })
        .expect(200);

      await prisma.savedSearch.update({
        where: { id: searchId },
        data: { lastRunAt: new Date(Date.now() - 2 * 86_400_000), lastNotifiedAt: null },
      });

      expect(await sendSavedSearchAlerts()).toBe(0);
    });

    it('respects the notification preference switch', async () => {
      await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .set(auth())
        .send({ alertsEnabled: true })
        .expect(200);
      await prisma.notificationPreference.update({
        where: { userId: user.id },
        data: { savedSearches: false },
      });
      await prisma.savedSearch.update({
        where: { id: searchId },
        data: { lastRunAt: new Date(Date.now() - 2 * 86_400_000), lastNotifiedAt: null },
      });

      expect(await sendSavedSearchAlerts()).toBe(0);

      await prisma.notificationPreference.update({
        where: { userId: user.id },
        data: { savedSearches: true },
      });
    });

    it('is private to its owner', async () => {
      const other = await registerUser();
      await request(app)
        .get(`/api/saved-searches/${searchId}/results`)
        .set({ authorization: `Bearer ${other.token}` })
        .expect(404);
      await request(app)
        .delete(`/api/saved-searches/${searchId}`)
        .set({ authorization: `Bearer ${other.token}` })
        .expect(404);
    });

    it('deletes cleanly', async () => {
      await request(app).delete(`/api/saved-searches/${searchId}`).set(auth()).expect(204);
      const remaining = await request(app).get('/api/saved-searches').set(auth()).expect(200);
      expect(remaining.body.every((s: { id: string }) => s.id !== searchId)).toBe(true);
    });
  });
});

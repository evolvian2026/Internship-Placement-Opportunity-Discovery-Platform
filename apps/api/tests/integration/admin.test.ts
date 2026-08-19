import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runIngestion } from '../../src/ingestion/pipeline';
import {
  app, createMockSource, makeAdmin, prisma, registerUser, request, resetDatabase, type TestUser,
} from './helpers';

describe('admin surface', () => {
  let admin: TestUser;
  let student: TestUser;
  let sourceId: string;

  beforeAll(async () => {
    await resetDatabase();
    const source = await createMockSource({ count: 15, seed: 5 });
    sourceId = source.id;
    await runIngestion(sourceId, { triggeredBy: 'test' });

    admin = await registerUser({ email: 'admin-test@example.com' });
    await makeAdmin(admin.id);
    // The role lives in the token, so a fresh sign-in is needed.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin-test@example.com', password: 'Password1' })
      .expect(200);
    admin.token = res.body.accessToken;

    student = await registerUser();

    // Seed the manual source that admin-created opportunities are attributed to.
    await prisma.sourceConnector.upsert({
      where: { slug: 'manual-entry' },
      update: {},
      create: { name: 'Manual Admin Entry', slug: 'manual-entry', kind: 'MANUAL', trustLevel: 'OFFICIAL', config: {} },
    });
  }, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const auth = () => ({ authorization: `Bearer ${admin.token}` });

  it('reports platform analytics', async () => {
    const res = await request(app).get('/api/admin/analytics').set(auth()).expect(200);

    expect(res.body.totals.opportunities).toBeGreaterThan(0);
    expect(res.body.byIndustry.length).toBeGreaterThan(0);
    expect(res.body.governmentVsPrivate).toHaveLength(2);
    expect(res.body.ingestionHealth.length).toBeGreaterThan(0);
  });

  it('reports data quality', async () => {
    const res = await request(app).get('/api/admin/data-quality').set(auth()).expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('lists sources with their access policy and cumulative stats', async () => {
    const res = await request(app).get('/api/admin/sources').set(auth()).expect(200);
    const source = res.body.find((s: { id: string }) => s.id === sourceId);

    expect(source).toBeDefined();
    expect(source.respectsRobotsTxt).toBe(true);
    expect(source.stats.fetched).toBeGreaterThan(0);
  });

  it('lists ingestion jobs and their logs', async () => {
    const jobs = await request(app).get('/api/admin/ingestion/jobs').set(auth()).expect(200);
    expect(jobs.body.items.length).toBeGreaterThan(0);

    const logs = await request(app)
      .get(`/api/admin/ingestion/jobs/${jobs.body.items[0].id}/logs`)
      .set(auth())
      .expect(200);
    expect(Array.isArray(logs.body)).toBe(true);
  });

  it('triggers a source run on demand', async () => {
    const res = await request(app).post(`/api/admin/sources/${sourceId}/run?sync=true`).set(auth()).expect(200);
    expect(res.body.result.status).toBe('SUCCESS');
  });

  it('creates an opportunity, always attributing a source', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities')
      .set(auth())
      .send({
        title: 'Graduate Engineer Trainee',
        organizationName: 'Test PSU Nigam',
        opportunityType: 'PSU_JOB',
        applicationUrl: 'https://example.gov.in/careers/1',
        description: 'A manually entered opportunity for the test suite.',
        applicationDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        skills: ['AutoCAD'],
        eligibility: { degrees: ['B_TECH'], branches: ['Mechanical'], graduationYears: [2026], minCgpa: 6.5 },
      })
      .expect(201);

    expect(res.body.title).toBe('Graduate Engineer Trainee');
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.eligibilityDetail.minCgpa).toBe(6.5);
  });

  it('verifies and expires an opportunity', async () => {
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { deletedAt: null } });

    await request(app)
      .post(`/api/admin/opportunities/${opportunity.id}/status`)
      .set(auth())
      .send({ status: 'VERIFIED' })
      .expect(204);

    const verified = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(verified.status).toBe('VERIFIED');
    expect(verified.lastVerifiedAt).not.toBeNull();

    await request(app)
      .post(`/api/admin/opportunities/${opportunity.id}/status`)
      .set(auth())
      .send({ status: 'EXPIRED' })
      .expect(204);
  });

  it('soft-deletes an opportunity so it leaves every public read path', async () => {
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { deletedAt: null } });

    await request(app).delete(`/api/admin/opportunities/${opportunity.id}`).set(auth()).expect(204);

    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(row.deletedAt).not.toBeNull();

    const publicSearch = await request(app).get('/api/opportunities?pageSize=50').expect(200);
    expect(publicSearch.body.items.some((i: { id: string }) => i.id === opportunity.id)).toBe(false);
  });

  it('adds an industry and a domain without a code change', async () => {
    const industry = await request(app)
      .post('/api/admin/industries')
      .set(auth())
      .send({ name: 'Maritime Logistics' })
      .expect(201);

    const domain = await request(app)
      .post('/api/admin/domains')
      .set(auth())
      .send({ industryId: industry.body.id, name: 'Port Operations' })
      .expect(201);

    expect(domain.body.slug).toBeTruthy();

    // The new taxonomy is immediately filterable.
    const taxonomy = await request(app).get('/api/taxonomy').expect(200);
    expect(taxonomy.body.industries.some((i: { name: string }) => i.name === 'Maritime Logistics')).toBe(true);
  });

  it('lists users with their activity', async () => {
    const res = await request(app).get('/api/admin/users').set(auth()).expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.items[0]).toHaveProperty('profileCompletion');
  });

  it('grants and revokes admin, but never lets an admin demote themselves', async () => {
    await request(app)
      .post(`/api/admin/users/${student.id}/role`)
      .set(auth())
      .send({ role: 'ADMIN' })
      .expect(204);

    const promoted = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(promoted.role).toBe('ADMIN');

    await request(app)
      .post(`/api/admin/users/${admin.id}/role`)
      .set(auth())
      .send({ role: 'STUDENT' })
      .expect(409);
  });

  it('records every administrative action in the audit log', async () => {
    const res = await request(app).get('/api/admin/audit-log').set(auth()).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.map((r: { action: string }) => r.action)).toContain('opportunity.create');
  });

  it('reports system health', async () => {
    const res = await request(app).get('/api/admin/system-health').set(auth()).expect(200);
    expect(res.body.database.status).toBe('ok');
    expect(res.body).toHaveProperty('uptimeSeconds');
  });
});

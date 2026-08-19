import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runIngestion } from '../../src/ingestion/pipeline';
import { app, createMockSource, prisma, registerUser, request, resetDatabase, type TestUser } from './helpers';

/**
 * The definition-of-done journey (requirement 52), exercised end to end:
 *
 *   sign up → build profile → search → filter → check eligibility →
 *   see a match score → see missing skills → save → track → deadlines →
 *   follow a company → ask the assistant → career readiness
 */
describe('student journey', () => {
  let user: TestUser;
  let opportunityId: string;
  let opportunitySlug: string;

  beforeAll(async () => {
    await resetDatabase();
    const source = await createMockSource({ count: 40, seed: 99 });
    await runIngestion(source.id, { triggeredBy: 'test' });
    user = await registerUser({ name: 'Rahul Sharma' });
  }, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const auth = () => ({ authorization: `Bearer ${user.token}` });

  it('1. builds a career profile', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set(auth())
      .send({
        city: 'Bengaluru',
        state: 'Karnataka',
        yearsOfExperience: 0,
        skills: ['Python', 'SQL', 'Pandas', 'Excel'],
        education: [
          {
            degree: 'B_TECH',
            branch: 'CSE',
            college: 'RV College of Engineering',
            graduationYear: new Date().getFullYear(),
            cgpa: 8.4,
            backlogs: 0,
            isPrimary: true,
          },
        ],
        preferences: {
          desiredRoles: ['Data Analyst'],
          preferredLocations: ['Bengaluru'],
          opportunityPreference: 'ANY',
          sectorPreference: 'ANY',
        },
      })
      .expect(200);

    expect(res.body.skills).toContain('Python');
    expect(res.body.education[0].degree).toBe('B_TECH');
    expect(res.body.profileCompletion).toBeGreaterThan(50);
  });

  it('2. searches opportunities and gets facets back', async () => {
    const res = await request(app).get('/api/opportunities?pageSize=10').set(auth()).expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.facets.types.length).toBeGreaterThan(0);
  });

  it('3. searches in natural language and sees the interpretation', async () => {
    const res = await request(app)
      .get('/api/opportunities')
      .query({ q: 'government jobs for BTech CSE', pageSize: 5 })
      .set(auth())
      .expect(200);

    expect(res.body.interpretation).toBeTruthy();
    expect(res.body.interpretedFilters.degrees).toContain('B_TECH');
  });

  it('4. filters by opportunity type', async () => {
    const res = await request(app)
      .get('/api/opportunities')
      .query({ types: 'INTERNSHIP', pageSize: 20 })
      .set(auth())
      .expect(200);

    for (const item of res.body.items) {
      expect(item.opportunityType).toBe('INTERNSHIP');
    }
  });

  it('5. serves the dedicated internship, government, PSU and fresher modules', async () => {
    for (const module of ['internships', 'government', 'psu', 'freshers']) {
      const res = await request(app)
        .get(`/api/opportunities/${module}?pageSize=5`)
        .set(auth())
        .expect(200);
      expect(res.body).toHaveProperty('items');
    }
  });

  it('6. returns a match score and an eligibility verdict on every result', async () => {
    const res = await request(app)
      .get('/api/opportunities?sort=match&pageSize=5')
      .set(auth())
      .expect(200);

    const first = res.body.items[0];
    opportunityId = first.id;
    opportunitySlug = first.slug;

    expect(first.match.overall).toBeGreaterThanOrEqual(0);
    expect(first.match.components).toHaveLength(6);
    expect(['ELIGIBLE', 'NEEDS_REVIEW', 'NOT_ELIGIBLE']).toContain(first.eligibility.verdict);

    // Results must be ordered by match score.
    const scores = res.body.items.map((i: { match: { overall: number } }) => i.match.overall);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
  });

  it('7. never scores an ineligible opportunity as a strong match', async () => {
    const res = await request(app)
      .get('/api/opportunities?pageSize=50')
      .set(auth())
      .expect(200);

    for (const item of res.body.items) {
      if (item.eligibility.verdict === 'NOT_ELIGIBLE') {
        expect(item.match.overall).toBeLessThanOrEqual(35);
      }
    }
  });

  it('8. filters to only eligible opportunities', async () => {
    const res = await request(app)
      .get('/api/opportunities?eligibleOnly=true&pageSize=20')
      .set(auth())
      .expect(200);

    for (const item of res.body.items) {
      expect(item.eligibility.verdict).toBe('ELIGIBLE');
    }
  });

  it('9. opens the detail page with eligibility reasons, source and SEO data', async () => {
    const res = await request(app)
      .get(`/api/opportunities/${opportunitySlug}`)
      .set(auth())
      .expect(200);

    expect(res.body.eligibility.passed.length + res.body.eligibility.unknown.length).toBeGreaterThan(0);
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.applicationUrl).toMatch(/^https?:\/\//);
    expect(res.body.seo.jsonLd['@type']).toBe('JobPosting');
    expect(res.body.lastVerifiedAt).toBeTruthy();
  });

  it('10. shows which skills are missing', async () => {
    const res = await request(app)
      .get(`/api/dashboard/skill-gap?opportunityId=${opportunityId}`)
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('matchPercent');
    expect(Array.isArray(res.body.missingSkills)).toBe(true);
  });

  it('11. saves an opportunity', async () => {
    await request(app).post('/api/saved').set(auth()).send({ opportunityId }).expect(201);

    const res = await request(app).get('/api/saved').set(auth()).expect(200);
    expect(res.body.items.some((i: { id: string }) => i.id === opportunityId)).toBe(true);
  });

  it('12. tracks an application through the pipeline', async () => {
    const created = await request(app)
      .post('/api/applications')
      .set(auth())
      .send({ opportunityId, status: 'APPLIED' })
      .expect(201);

    const applicationId = created.body.id;
    expect(created.body.appliedAt).toBeTruthy();

    await request(app)
      .patch(`/api/applications/${applicationId}`)
      .set(auth())
      .send({ status: 'ASSESSMENT', eventNote: 'Online test scheduled' })
      .expect(200);

    const updated = await request(app)
      .patch(`/api/applications/${applicationId}`)
      .set(auth())
      .send({ status: 'INTERVIEW', interviewDate: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(200);

    expect(updated.body.status).toBe('INTERVIEW');
    // Every stage change is recorded.
    expect(updated.body.events.map((e: { status: string }) => e.status)).toEqual([
      'APPLIED',
      'ASSESSMENT',
      'INTERVIEW',
    ]);
  });

  it('13. refuses to track the same opportunity twice', async () => {
    await request(app)
      .post('/api/applications')
      .set(auth())
      .send({ opportunityId })
      .expect(409);
  });

  it('14. reports application analytics', async () => {
    const res = await request(app).get('/api/applications/analytics').set(auth()).expect(200);
    expect(res.body.applications).toBeGreaterThan(0);
    expect(res.body.interviews).toBeGreaterThan(0);
  });

  it('15. groups upcoming deadlines into buckets', async () => {
    const res = await request(app).get('/api/opportunities/deadlines').set(auth()).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const group of res.body) {
      expect(group).toHaveProperty('label');
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('16. follows a company and lists it back', async () => {
    const company = await prisma.company.findFirstOrThrow();
    await request(app).post(`/api/companies/${company.id}/follow`).set(auth()).expect(201);

    const res = await request(app).get('/api/companies/following').set(auth()).expect(200);
    expect(res.body.some((c: { id: string }) => c.id === company.id)).toBe(true);
  });

  it('17. renders the personalised dashboard', async () => {
    const res = await request(app).get('/api/dashboard').set(auth()).expect(200);

    expect(res.body.greeting).toMatch(/Good (Morning|Afternoon|Evening)/);
    expect(res.body.user.name).toBe('Rahul Sharma');
    expect(res.body.stats).toHaveProperty('matchingOpportunities');
    expect(res.body.readiness.overall).toBeGreaterThanOrEqual(0);
    expect(res.body.readiness.breakdown).toHaveLength(6);
  });

  it('18. answers an assistant question using only database rows', async () => {
    const res = await request(app)
      .post('/api/assistant/ask')
      .set(auth())
      .send({ question: 'Which jobs am I eligible for?' })
      .expect(200);

    expect(res.body.message.content.length).toBeGreaterThan(20);

    // Every cited opportunity must exist in the database.
    for (const citation of res.body.message.citations) {
      const exists = await prisma.opportunity.findUnique({ where: { id: citation.opportunityId } });
      expect(exists).not.toBeNull();
      expect(citation.applicationUrl).toMatch(/^https?:\/\//);
      expect(citation.sourceName).toBeTruthy();
    }
  });

  it('19. reports a career-readiness score with an explanation per component', async () => {
    const res = await request(app).get('/api/dashboard/readiness').set(auth()).expect(200);

    expect(res.body.overall).toBeGreaterThanOrEqual(0);
    expect(res.body.overall).toBeLessThanOrEqual(100);
    for (const item of res.body.breakdown) {
      expect(item.hint.length).toBeGreaterThan(10);
    }
  });

  it('20. produces career recommendations grounded in live opportunities', async () => {
    const res = await request(app).get('/api/dashboard/recommendations').set(auth()).expect(200);
    expect(res.body).toHaveProperty('roles');
    expect(res.body).toHaveProperty('skills');
  });

  it('21. exports the user data and then deletes the account', async () => {
    const exported = await request(app).get('/api/profile/export').set(auth()).expect(200);
    expect(exported.body.user.email).toBe(user.email);
    expect(exported.body).toHaveProperty('applications');

    await request(app).delete('/api/profile/account').set(auth()).expect(204);

    const gone = await prisma.user.findUnique({ where: { id: user.id } });
    expect(gone).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runIngestion } from '../../src/ingestion/pipeline';
import { findDuplicate, mergeOpportunities } from '../../src/ingestion/dedupe';
import { expireOverdue, markExpiringSoon } from '../../src/ingestion/verification';
import { createMockSource, prisma, resetDatabase } from './helpers';

describe('ingestion pipeline', () => {
  let sourceId: string;

  beforeAll(async () => {
    await resetDatabase();
    const source = await createMockSource({ count: 24, seed: 42 });
    sourceId = source.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it('ingests opportunities and records the run', async () => {
    const result = await runIngestion(sourceId, { triggeredBy: 'test' });

    expect(result.status).toBe('SUCCESS');
    expect(result.fetched).toBe(24);
    expect(result.created).toBeGreaterThan(0);
    expect(result.failed).toBe(0);

    const job = await prisma.ingestionJob.findFirstOrThrow({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
    });
    expect(job.status).toBe('SUCCESS');
    expect(job.recordsFetched).toBe(24);
  });

  it('stores every opportunity with its source and application URL', async () => {
    const opportunities = await prisma.opportunity.findMany({ include: { sources: true } });

    expect(opportunities.length).toBeGreaterThan(0);
    for (const opportunity of opportunities) {
      // Requirement 53: provenance is never blank.
      expect(opportunity.sources.length).toBeGreaterThan(0);
      expect(opportunity.applicationUrl).toMatch(/^https?:\/\//);
      expect(opportunity.lastVerifiedAt).not.toBeNull();
    }
  });

  it('extracts structured eligibility from the postings', async () => {
    const withEligibility = await prisma.opportunity.count({ where: { eligibility: { isNot: null } } });
    expect(withEligibility).toBeGreaterThan(0);
  });

  it('classifies opportunities into the taxonomy', async () => {
    const classified = await prisma.opportunity.count({ where: { industryId: { not: null } } });
    expect(classified).toBeGreaterThan(0);
  });

  it('is idempotent — a second run updates rather than duplicates', async () => {
    const before = await prisma.opportunity.count();
    const result = await runIngestion(sourceId, { triggeredBy: 'test' });
    const after = await prisma.opportunity.count();

    expect(after).toBe(before);
    expect(result.created).toBe(0);
    expect(result.updated).toBeGreaterThan(0);
  });

  it('detects a duplicate posting arriving from a second source', async () => {
    const existing = await prisma.opportunity.findFirstOrThrow({
      include: { locations: true },
    });

    const match = await findDuplicate({
      title: existing.title,
      organizationName: existing.organizationName,
      description: existing.description,
      city: existing.locations[0]?.city ?? null,
    });

    expect(match).not.toBeNull();
    expect(match!.opportunityId).toBe(existing.id);
    expect(match!.confidence).toBeGreaterThan(0.8);
  });

  it('does not treat a different role at the same company as a duplicate', async () => {
    const existing = await prisma.opportunity.findFirstOrThrow();
    const match = await findDuplicate({
      title: 'Completely Unrelated Chief Veterinary Officer',
      organizationName: existing.organizationName,
      description: 'Nothing whatsoever to do with the other posting.',
      city: null,
    });
    expect(match).toBeNull();
  });

  it('merges a duplicate and keeps both source references', async () => {
    const [survivor, duplicate] = await prisma.opportunity.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
    const survivorSourcesBefore = await prisma.opportunitySource.count({
      where: { opportunityId: survivor.id },
    });

    await mergeOpportunities(survivor.id, duplicate.id);

    const merged = await prisma.opportunity.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(merged.mergedIntoId).toBe(survivor.id);
    expect(merged.status).toBe('REMOVED');

    const survivorSourcesAfter = await prisma.opportunitySource.count({
      where: { opportunityId: survivor.id },
    });
    expect(survivorSourcesAfter).toBeGreaterThan(survivorSourcesBefore);
  });

  it('expires a posting once its deadline has passed', async () => {
    const opportunity = await prisma.opportunity.findFirstOrThrow({
      where: { status: { in: ['ACTIVE', 'VERIFIED', 'EXPIRING_SOON'] } },
    });
    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { applicationDeadline: new Date(Date.now() - 3 * 86_400_000) },
    });

    const count = await expireOverdue();
    expect(count).toBeGreaterThan(0);

    const after = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(after.status).toBe('EXPIRED');
  });

  it('marks a posting closing within three days as expiring soon', async () => {
    const opportunity = await prisma.opportunity.findFirstOrThrow({
      where: { status: { in: ['ACTIVE', 'VERIFIED'] } },
    });
    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { applicationDeadline: new Date(Date.now() + 2 * 86_400_000), status: 'ACTIVE' },
    });

    await markExpiringSoon();

    const after = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(after.status).toBe('EXPIRING_SOON');
  });

  it('records a per-record log for the run', async () => {
    const job = await prisma.ingestionJob.findFirstOrThrow({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
    });
    const logs = await prisma.ingestionLog.count({ where: { jobId: job.id } });
    expect(logs).toBeGreaterThan(0);
  });

  it('fails cleanly when the source is disabled', async () => {
    const disabled = await prisma.sourceConnector.create({
      data: { name: 'Disabled', slug: `disabled-${Date.now()}`, kind: 'MOCK', enabled: false, config: {} },
    });
    const result = await runIngestion(disabled.id, { triggeredBy: 'test' });

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/disabled/i);
  });
});

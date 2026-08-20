import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Cache-invalidation contract.
 *
 * The rest of the integration suite runs with REDIS_URL empty, which makes
 * caching a no-op — and therefore structurally blind to "the write succeeded
 * but the cache still serves the old value" bugs. This suite mocks the cache
 * module so the invariants are asserted regardless of whether Redis is up.
 *
 * The bug this guards against: an admin adding an industry or a domain, and the
 * new taxonomy not appearing in the filter UI until the 5-minute cache expired
 * — which defeats the requirement that admins can extend the taxonomy without
 * a code change or a deploy.
 */

const invalidateCache = vi.fn(async () => undefined);

vi.mock('../../src/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/redis')>();
  return {
    ...actual,
    invalidateCache,
    // Read-through caching becomes a straight pass-through in these tests.
    cached: async <T>(_key: string, _ttl: number, producer: () => Promise<T>) => producer(),
    getRedis: () => null,
  };
});

const { createDomain, createIndustry, setTaxonomyActive } = await import('../../src/modules/admin/admin.service');
const { prisma } = await import('../../src/lib/prisma');

describe('taxonomy cache invalidation', () => {
  let industryId: string;

  beforeAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.domain.deleteMany();
    await prisma.industry.deleteMany();
  });

  afterAll(async () => {
    await prisma.domain.deleteMany();
    await prisma.industry.deleteMany();
    await prisma.$disconnect();
  });

  it('invalidates the taxonomy cache when an industry is added', async () => {
    invalidateCache.mockClear();
    const created = await createIndustry('actor-1', 'Maritime Logistics');
    industryId = created.id;

    expect(invalidateCache).toHaveBeenCalledWith('taxonomy:*');
  });

  it('invalidates the taxonomy cache when a domain is added', async () => {
    invalidateCache.mockClear();
    await createDomain('actor-1', industryId, 'Port Operations');

    expect(invalidateCache).toHaveBeenCalledWith('taxonomy:*');
  });

  it('invalidates the taxonomy cache when something is deactivated', async () => {
    invalidateCache.mockClear();
    await setTaxonomyActive('actor-1', 'industry', industryId, false);

    expect(invalidateCache).toHaveBeenCalledWith('taxonomy:*');
  });
});

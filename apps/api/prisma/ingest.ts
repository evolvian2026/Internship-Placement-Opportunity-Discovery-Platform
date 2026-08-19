/**
 * One-shot ingestion runner.
 *
 * Usage:
 *   npm run ingest -w @odp/api              # every enabled source
 *   npm run ingest -w @odp/api -- <slug>    # a single source by slug
 */
import { prisma } from '../src/lib/prisma';
import { runAllSources, runIngestion } from '../src/ingestion/pipeline';
import { closeRedis } from '../src/lib/redis';

async function main(): Promise<void> {
  const slug = process.argv[2];

  if (slug) {
    const source = await prisma.sourceConnector.findUnique({ where: { slug } });
    if (!source) {
      console.error(`No source with slug "${slug}".`);
      process.exit(1);
    }
    const result = await runIngestion(source.id, { triggeredBy: 'cli' });
    console.log(`${source.name}:`, result);
  } else {
    const results = await runAllSources({ triggeredBy: 'cli' });
    if (results.length === 0) {
      console.log('No enabled sources matched the current DATA_SOURCE mode.');
    }
    for (const result of results) {
      console.log(result);
    }
  }

  const total = await prisma.opportunity.count({ where: { deletedAt: null, mergedIntoId: null } });
  console.log(`\nOpportunities in database: ${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    // Both connections must close or the CLI process never exits.
    await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
  });

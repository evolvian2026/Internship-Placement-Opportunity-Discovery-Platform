import { stripHtml } from '../../lib/text';
import type { Connector, ConnectorContext, RawOpportunity } from '../types';

/**
 * Lever postings connector.
 *
 * Lever publishes a documented public postings API per company:
 *   https://api.lever.co/v0/postings/{company}?mode=json
 *
 * As with Greenhouse this is the employer's own data served by their ATS for
 * third-party consumption, so it is an official API rather than a scrape.
 */

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  description?: string;
  categories?: { location?: string; team?: string; commitment?: string; department?: string };
  lists?: { text?: string; content?: string }[];
}

export const leverConnector: Connector = {
  kind: 'LEVER',
  accessPolicy:
    'Uses the public, documented Lever postings API (api.lever.co/v0/postings). No authentication and no scraping of rendered pages.',

  async fetch(ctx: ConnectorContext): Promise<RawOpportunity[]> {
    const config = ctx.config as {
      company?: string;
      companies?: string[];
      organizationName?: string;
    };

    const companies = config.companies ?? (config.company ? [config.company] : []);
    if (companies.length === 0) {
      ctx.log('warn', 'Lever connector has no company configured');
      return [];
    }

    const out: RawOpportunity[] = [];

    for (const company of companies) {
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;

      let postings: LeverPosting[];
      try {
        postings = await ctx.fetchJson<LeverPosting[]>(url);
      } catch (err) {
        ctx.log('error', `Lever company ${company} failed`, { error: String(err) });
        continue;
      }

      ctx.log('info', `Lever company ${company} returned ${postings.length} postings`);

      for (const posting of postings) {
        if (!posting.text || !posting.hostedUrl) continue;

        // Lever splits the body across `description` and `lists` sections.
        const listText = (posting.lists ?? [])
          .map((l) => `${l.text ?? ''}\n${stripHtml(l.content ?? '')}`)
          .join('\n\n');
        const description = [
          posting.descriptionPlain ?? stripHtml(posting.description ?? ''),
          listText,
        ]
          .filter(Boolean)
          .join('\n\n');

        out.push({
          externalId: `lever:${company}:${posting.id}`,
          title: posting.text,
          organizationName: config.organizationName ?? company,
          sourceUrl: posting.hostedUrl,
          applicationUrl: posting.applyUrl ?? posting.hostedUrl,
          description,
          rawText: description,
          locationText: posting.categories?.location,
          domainHint: posting.categories?.team ?? posting.categories?.department,
          typeHint: posting.categories?.commitment,
          postedDate: posting.createdAt ? new Date(posting.createdAt) : undefined,
          rawPayload: posting,
        });
      }
    }

    return out.slice(0, ctx.limit ?? 1000);
  },
};

import { parseLooseDate } from '../../lib/dates';
import { stripHtml } from '../../lib/text';
import type { Connector, ConnectorContext, RawOpportunity } from '../types';

/**
 * Greenhouse job-board connector.
 *
 * Greenhouse publishes a documented, public, unauthenticated JSON API for every
 * board an employer chooses to make public:
 *   https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *
 * This is the employer's own careers data, served by the ATS specifically for
 * third-party consumption — an official API, which the requirements prefer over
 * scraping the rendered careers page.
 */

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  content?: string;
  location?: { name?: string };
  offices?: { name?: string }[];
  departments?: { name?: string }[];
  metadata?: { name?: string; value?: unknown }[];
}

export const greenhouseConnector: Connector = {
  kind: 'GREENHOUSE',
  accessPolicy:
    'Uses the public, documented Greenhouse Job Board API (boards-api.greenhouse.io). No authentication, no scraping of rendered pages, and only boards the employer has made public.',

  async fetch(ctx: ConnectorContext): Promise<RawOpportunity[]> {
    const config = ctx.config as {
      boardToken?: string;
      boardTokens?: string[];
      organizationName?: string;
      typeHint?: string;
    };

    const tokens = config.boardTokens ?? (config.boardToken ? [config.boardToken] : []);
    if (tokens.length === 0) {
      ctx.log('warn', 'Greenhouse connector has no boardToken configured');
      return [];
    }

    const out: RawOpportunity[] = [];

    for (const token of tokens) {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;

      let payload: { jobs?: GreenhouseJob[] };
      try {
        payload = await ctx.fetchJson<{ jobs?: GreenhouseJob[] }>(url);
      } catch (err) {
        ctx.log('error', `Greenhouse board ${token} failed`, { error: String(err) });
        continue;
      }

      const jobs = payload.jobs ?? [];
      ctx.log('info', `Greenhouse board ${token} returned ${jobs.length} jobs`);

      for (const job of jobs) {
        if (!job.title || !job.absolute_url) continue;

        // Greenhouse returns HTML-escaped content in `content`.
        const description = job.content ? stripHtml(job.content) : undefined;
        const locationText =
          job.location?.name ?? job.offices?.map((o) => o.name).filter(Boolean).join(' | ');

        out.push({
          externalId: `greenhouse:${token}:${job.id}`,
          title: job.title,
          organizationName: config.organizationName ?? token,
          sourceUrl: job.absolute_url,
          applicationUrl: job.absolute_url,
          description,
          rawText: description,
          locationText,
          domainHint: job.departments?.[0]?.name,
          typeHint: config.typeHint,
          postedDate: parseLooseDate(job.updated_at) ?? undefined,
          rawPayload: job,
        });
      }
    }

    return out.slice(0, ctx.limit ?? 1000);
  },
};

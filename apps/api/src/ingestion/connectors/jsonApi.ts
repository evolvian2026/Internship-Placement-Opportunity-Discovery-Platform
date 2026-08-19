import { parseLooseDate } from '../../lib/dates';
import type { Connector, ConnectorContext, RawOpportunity } from '../types';

/**
 * Generic JSON API connector.
 *
 * Configured with a field mapping, so a new *official* API can be onboarded
 * by an administrator without writing code:
 *
 * {
 *   "url": "https://careers.example.com/api/openings",
 *   "itemsPath": "data.jobs",
 *   "mapping": { "externalId": "id", "title": "name", "sourceUrl": "absolute_url" }
 * }
 */

function readPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) {
      const index = Number(key);
      return Number.isInteger(index) ? acc[index] : undefined;
    }
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((v) => asString(v)).filter((v): v is string => Boolean(v));
  }
  const single = asString(value);
  return single ? [single] : undefined;
}

export const jsonApiConnector: Connector = {
  kind: 'JSON_API',
  accessPolicy:
    'Calls a documented, publicly accessible JSON endpoint declared by the source owner. Requires no authentication bypass; requests are rate-limited and carry a contactable User-Agent.',

  async fetch(ctx: ConnectorContext): Promise<RawOpportunity[]> {
    const config = ctx.config as {
      url?: string;
      itemsPath?: string;
      organizationName?: string;
      typeHint?: string;
      headers?: Record<string, string>;
      mapping?: Record<string, string>;
    };

    if (!config.url) {
      ctx.log('warn', 'JSON API connector has no url configured');
      return [];
    }

    const payload = await ctx.fetchJson<unknown>(config.url, {
      headers: config.headers,
    } as RequestInit);

    const rawItems = config.itemsPath ? readPath(payload, config.itemsPath) : payload;
    if (!Array.isArray(rawItems)) {
      ctx.log('error', 'itemsPath did not resolve to an array', { itemsPath: config.itemsPath });
      return [];
    }

    const map = config.mapping ?? {};
    const get = (item: unknown, field: string): unknown =>
      map[field] ? readPath(item, map[field]) : readPath(item, field);

    const out: RawOpportunity[] = [];

    for (const item of rawItems.slice(0, ctx.limit ?? 500)) {
      const title = asString(get(item, 'title'));
      const sourceUrl = asString(get(item, 'sourceUrl'));
      const externalId = asString(get(item, 'externalId')) ?? sourceUrl;

      // Without these three the row cannot be stored or attributed.
      if (!title || !sourceUrl || !externalId) continue;

      out.push({
        externalId,
        title,
        organizationName:
          asString(get(item, 'organizationName')) ?? config.organizationName ?? new URL(sourceUrl).hostname,
        sourceUrl,
        applicationUrl: asString(get(item, 'applicationUrl')),
        description: asString(get(item, 'description')),
        rawText: asString(get(item, 'rawText')),
        locationText: asString(get(item, 'location')),
        typeHint: asString(get(item, 'type')) ?? config.typeHint,
        industryHint: asString(get(item, 'industry')),
        domainHint: asString(get(item, 'domain')),
        role: asString(get(item, 'role')),
        skills: asStringArray(get(item, 'skills')),
        salaryText: asString(get(item, 'salary')),
        postedDate: parseLooseDate(get(item, 'postedDate')) ?? undefined,
        applicationDeadline: parseLooseDate(get(item, 'deadline')) ?? undefined,
        eligibilityText: asString(get(item, 'eligibility')),
        rawPayload: item,
      });
    }

    ctx.log('info', `JSON API returned ${out.length} usable records of ${rawItems.length}`);
    return out;
  },
};

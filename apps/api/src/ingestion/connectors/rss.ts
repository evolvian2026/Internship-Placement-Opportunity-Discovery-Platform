import { parseLooseDate } from '../../lib/dates';
import { stripHtml } from '../../lib/text';
import type { Connector, ConnectorContext, RawOpportunity } from '../types';

/**
 * RSS / Atom connector.
 *
 * Feeds are published *for* machine consumption, which is why they are the
 * preferred access mechanism after an official API. No HTML page is scraped:
 * only the feed document itself is fetched.
 */

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function tagValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : undefined;
}

function attrValue(xml: string, tag: string, attr: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*/?>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : undefined;
}

export function parseFeed(xml: string): Record<string, string | undefined>[] {
  const itemPattern = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  const out: Record<string, string | undefined>[] = [];

  for (const match of xml.matchAll(itemPattern)) {
    const body = match[2];
    out.push({
      title: tagValue(body, 'title'),
      // Atom puts the URL in <link href="...">, RSS in <link>text</link>.
      link: tagValue(body, 'link') || attrValue(body, 'link', 'href'),
      description:
        tagValue(body, 'content:encoded') ??
        tagValue(body, 'description') ??
        tagValue(body, 'summary') ??
        tagValue(body, 'content'),
      pubDate: tagValue(body, 'pubDate') ?? tagValue(body, 'published') ?? tagValue(body, 'updated'),
      guid: tagValue(body, 'guid') ?? tagValue(body, 'id'),
      category: tagValue(body, 'category'),
      author: tagValue(body, 'author') ?? tagValue(body, 'dc:creator'),
    });
  }
  return out;
}

export const rssConnector: Connector = {
  kind: 'RSS',
  accessPolicy:
    'Fetches only the publicly published RSS/Atom feed document. Feeds exist to be consumed by machines; no HTML page is scraped and robots.txt is honoured.',

  async fetch(ctx: ConnectorContext): Promise<RawOpportunity[]> {
    const config = ctx.config as {
      feedUrl?: string;
      feedUrls?: string[];
      organizationName?: string;
      defaultLocation?: string;
      typeHint?: string;
    };

    const urls = config.feedUrls ?? (config.feedUrl ? [config.feedUrl] : []);
    if (urls.length === 0) {
      ctx.log('warn', 'RSS connector has no feedUrl configured');
      return [];
    }

    const out: RawOpportunity[] = [];

    for (const url of urls) {
      let xml: string;
      try {
        xml = await ctx.fetchText(url);
      } catch (err) {
        ctx.log('error', `failed to fetch feed ${url}`, { error: String(err) });
        continue;
      }

      const entries = parseFeed(xml);
      ctx.log('info', `feed ${url} returned ${entries.length} entries`);

      for (const entry of entries) {
        if (!entry.title || !entry.link) continue;

        const description = entry.description ? stripHtml(entry.description) : undefined;
        out.push({
          // The feed's guid is the stable id; fall back to the link.
          externalId: entry.guid ?? entry.link,
          title: entry.title,
          // Feeds rarely name the employer separately; fall back to configuration.
          organizationName: entry.author ?? config.organizationName ?? new URL(entry.link).hostname,
          sourceUrl: entry.link,
          description,
          rawText: description,
          locationText: config.defaultLocation,
          typeHint: config.typeHint,
          postedDate: parseLooseDate(entry.pubDate) ?? undefined,
          tags: entry.category ? [entry.category] : undefined,
          rawPayload: entry,
        });
      }
    }

    return out.slice(0, ctx.limit ?? 500);
  },
};

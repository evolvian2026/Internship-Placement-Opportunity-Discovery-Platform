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

/**
 * Named entities seen in practice. Feeds from government portals are commonly
 * produced by CMS exports that emit HTML entities into XML, where only the
 * five XML built-ins are actually defined.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  hellip: '\u2026',
  bull: '\u2022',
  middot: '\u00b7',
  deg: '\u00b0',
  times: '\u00d7',
  rupee: '\u20b9',
};

function decodeCodePoint(raw: string, hex: boolean): string | null {
  const code = Number.parseInt(raw, hex ? 16 : 10);
  // Reject anything outside the Unicode range or in the surrogate block; a
  // malformed entity must be left alone, not turned into a replacement char.
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

/**
 * Decode entities in a single pass.
 *
 * Order matters: replacing `&amp;` before the others decodes twice, so the
 * escaped text `&amp;lt;` — which means the literal characters `&lt;` — would
 * come out as a `<` and turn quoted text into markup.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        return decodeCodePoint(body.slice(2), true) ?? whole;
      }
      if (body.startsWith('#')) {
        return decodeCodePoint(body.slice(1), false) ?? whole;
      }
      const named = NAMED_ENTITIES[body.toLowerCase()];
      return named ?? whole;
    });
}

function tagValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match) return undefined;
  const value = decodeEntities(match[1]).trim();
  return value || undefined;
}

/**
 * Pick the entry's own page out of an Atom `<link>` set.
 *
 * An entry routinely carries several: `rel="self"` points at the feed
 * document, `rel="enclosure"` at an attachment. Taking the first match sends
 * every applicant to the feed instead of the posting, so prefer the link that
 * actually states it is the alternate representation, then an unqualified one.
 */
function linkHref(body: string): string | undefined {
  const links = [...body.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  if (links.length === 0) return undefined;

  const hrefOf = (attrs: string): string | undefined => {
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    return href ? decodeEntities(href[1]).trim() || undefined : undefined;
  };
  const relOf = (attrs: string): string => {
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i);
    return rel ? rel[1].toLowerCase() : '';
  };

  const alternate = links.find((a) => relOf(a) === 'alternate');
  if (alternate) return hrefOf(alternate);

  const unqualified = links.find((a) => relOf(a) === '');
  if (unqualified) return hrefOf(unqualified);

  return undefined;
}

/**
 * Resolve an entry link against the feed it came from.
 *
 * Feeds often carry site-relative paths. Returns undefined rather than a
 * guess when the result cannot be a real absolute http(s) URL — an
 * application link that does not resolve is worse than no link at all, and
 * the entry is dropped upstream.
 */
export function resolveEntryLink(link: string | undefined, feedUrl?: string): string | undefined {
  if (!link) return undefined;
  try {
    const url = feedUrl ? new URL(link, feedUrl) : new URL(link);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseFeed(xml: string, feedUrl?: string): Record<string, string | undefined>[] {
  const itemPattern = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  const out: Record<string, string | undefined>[] = [];

  for (const match of xml.matchAll(itemPattern)) {
    const body = match[2];
    // RSS puts the URL in <link>text</link>, Atom in <link href="..."/>.
    const rawLink = tagValue(body, 'link') ?? linkHref(body);
    out.push({
      title: tagValue(body, 'title'),
      link: resolveEntryLink(rawLink, feedUrl),
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

      const entries = parseFeed(xml, url);
      ctx.log('info', `feed ${url} returned ${entries.length} entries`);

      let unresolved = 0;
      for (const entry of entries) {
        // An entry whose link did not resolve to an absolute http(s) URL is
        // dropped: there is nowhere to send an applicant, and inventing a
        // destination is worse than omitting the posting.
        if (!entry.title || !entry.link) {
          if (entry.title) unresolved += 1;
          continue;
        }

        const description = entry.description ? stripHtml(entry.description) : undefined;
        out.push({
          // The feed's guid is the stable id; fall back to the link.
          externalId: entry.guid ?? entry.link,
          title: entry.title,
          // Feeds rarely name the employer separately; fall back to configuration.
          organizationName:
            entry.author ?? config.organizationName ?? new URL(entry.link).hostname,
          sourceUrl: entry.link,
          description,
          rawText: description,
          locationText: config.defaultLocation,
          typeDefault: config.typeHint,
          postedDate: parseLooseDate(entry.pubDate) ?? undefined,
          tags: entry.category ? [entry.category] : undefined,
          rawPayload: entry,
        });
      }

      if (unresolved > 0) {
        ctx.log('warn', `feed ${url} had ${unresolved} entries with no usable link`);
      }
    }

    return out.slice(0, ctx.limit ?? 500);
  },
};

import { describe, expect, it } from 'vitest';
import { parseFeed, resolveEntryLink } from '../../src/ingestion/connectors/rss';

/**
 * Feed-parsing contract, written against the shapes real government and PSU
 * portals publish rather than the tidy RSS in the specification. Their feeds
 * are usually CMS exports: HTML entities leak into XML, links are
 * site-relative, and Atom entries carry several <link> elements.
 */

const FEED_URL = 'https://ssc.gov.in/feeds/notices.xml';

function rss(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>${items}</channel></rss>`;
}

describe('entity decoding', () => {
  it('decodes hex numeric entities, which Indian portal exports emit heavily', () => {
    const [entry] = parseFeed(
      rss(`<item><title>Advt. No. 04&#x2F;2026 &#x2013; Junior Engineer</title>
           <link>https://ssc.gov.in/n/1</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('Advt. No. 04/2026 – Junior Engineer');
  });

  it('decodes decimal numeric entities', () => {
    const [entry] = parseFeed(
      rss(`<item><title>Stipend &#8377;25,000 &#8211; per month</title>
           <link>https://ssc.gov.in/n/2</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('Stipend ₹25,000 – per month');
  });

  it('decodes the named entities CMS exports emit into XML', () => {
    const [entry] = parseFeed(
      rss(`<item><title>Pay&nbsp;Level&nbsp;6 &mdash; Group&nbsp;B</title>
           <link>https://ssc.gov.in/n/3</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('Pay Level 6 — Group B');
  });

  it('does not decode twice, so escaped markup stays text', () => {
    // &amp;lt; means the literal characters "&lt;". Decoding &amp; first and
    // &lt; afterwards would turn quoted text into a tag.
    const [entry] = parseFeed(
      rss(`<item><title>Use &amp;lt;b&amp;gt; to embolden</title>
           <link>https://ssc.gov.in/n/4</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('Use &lt;b&gt; to embolden');
  });

  it('leaves an entity it does not recognise untouched rather than dropping it', () => {
    const [entry] = parseFeed(
      rss(`<item><title>Grade &clubsuit; notice</title><link>https://ssc.gov.in/n/5</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('Grade &clubsuit; notice');
  });

  it('refuses out-of-range and surrogate code points instead of emitting junk', () => {
    const [entry] = parseFeed(
      rss(`<item><title>bad &#xD800; and &#x110000; here</title>
           <link>https://ssc.gov.in/n/6</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('bad &#xD800; and &#x110000; here');
  });

  it('unwraps CDATA', () => {
    const [entry] = parseFeed(
      rss(`<item><title><![CDATA[Recruitment 2026 & Beyond]]></title>
           <link>https://ssc.gov.in/n/7</link></item>`),
      FEED_URL,
    );

    expect(entry.title).toBe('Recruitment 2026 & Beyond');
  });
});

describe('link resolution', () => {
  it('resolves a site-relative link against the feed it came from', () => {
    const [entry] = parseFeed(
      rss(`<item><title>Notice</title><link>/notices/je-2026</link></item>`),
      FEED_URL,
    );

    expect(entry.link).toBe('https://ssc.gov.in/notices/je-2026');
  });

  it('drops a link that cannot become an absolute http(s) URL', () => {
    for (const href of ['javascript:void(0)', 'mailto:jobs@ssc.gov.in', 'not a url at all']) {
      expect(resolveEntryLink(href)).toBeUndefined();
    }
  });

  it('resolves nothing from an empty link rather than guessing', () => {
    expect(resolveEntryLink(undefined, FEED_URL)).toBeUndefined();
  });
});

describe('Atom entries', () => {
  const atom = (links: string) => `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Assistant Manager</title>
      ${links}
      <id>ntpc-am-2026</id>
      <updated>2026-09-01T05:00:00Z</updated>
      <summary>Applications close 30 September 2026</summary>
    </entry></feed>`;

  it('follows rel="alternate" rather than the feed\'s own rel="self"', () => {
    // Taking the first <link> would send every applicant to the feed document.
    const [entry] = parseFeed(
      atom(`<link rel="self" href="https://careers.ntpc.co.in/feed.xml"/>
            <link rel="alternate" href="https://careers.ntpc.co.in/jobs/am-2026"/>`),
      'https://careers.ntpc.co.in/feed.xml',
    );

    expect(entry.link).toBe('https://careers.ntpc.co.in/jobs/am-2026');
  });

  it('accepts an unqualified link when no rel is given', () => {
    const [entry] = parseFeed(
      atom(`<link href="https://careers.ntpc.co.in/jobs/am-2026"/>`),
      'https://careers.ntpc.co.in/feed.xml',
    );

    expect(entry.link).toBe('https://careers.ntpc.co.in/jobs/am-2026');
  });

  it('ignores a link set that offers only an enclosure', () => {
    const [entry] = parseFeed(
      atom(`<link rel="enclosure" href="https://careers.ntpc.co.in/advt.pdf"/>`),
      'https://careers.ntpc.co.in/feed.xml',
    );

    expect(entry.link).toBeUndefined();
  });

  it('maps Atom field names onto the common shape', () => {
    const [entry] = parseFeed(
      atom(`<link rel="alternate" href="https://careers.ntpc.co.in/jobs/am-2026"/>`),
      'https://careers.ntpc.co.in/feed.xml',
    );

    expect(entry.guid).toBe('ntpc-am-2026');
    expect(entry.pubDate).toBe('2026-09-01T05:00:00Z');
    expect(entry.description).toBe('Applications close 30 September 2026');
  });
});

describe('malformed feeds', () => {
  it('returns nothing for a document with no items instead of throwing', () => {
    expect(parseFeed('<html><body>Service unavailable</body></html>', FEED_URL)).toEqual([]);
  });

  it('treats an empty tag as absent, not as an empty string', () => {
    const [entry] = parseFeed(
      rss(`<item><title>Notice</title><link>https://ssc.gov.in/n/8</link>
           <description>   </description></item>`),
      FEED_URL,
    );

    expect(entry.description).toBeUndefined();
  });
});

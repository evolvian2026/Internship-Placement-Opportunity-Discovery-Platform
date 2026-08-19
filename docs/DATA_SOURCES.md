# Data sources & access policy

The platform's value depends on data that is **accurate, fresh and lawfully
obtained**. This document records the rules the ingestion layer enforces and how
to onboard a new source.

## Access rules (enforced in code, not just policy)

`apps/api/src/ingestion/http.ts` is the only outbound HTTP path connectors may
use. It enforces:

| Rule | Implementation |
| --- | --- |
| Descriptive, contactable User-Agent | `INGESTION_USER_AGENT`, sent on every request |
| Per-host rate limiting | Token bucket, `rateLimitPerMinute` per source |
| `robots.txt` honoured | Fetched, parsed and cached for 6 hours; longest-match wins |
| No authentication walls | URLs matching login/signin/auth/account/checkout patterns are refused |
| No credential stuffing | A URL embedding credentials is refused |
| 401/403 treated as "not public" | Raises `AccessNotPermittedError`; the run does not retry around it |
| Request timeout | 20s, so a hung source cannot stall a worker |

There is deliberately **no** cookie jar, **no** headless browser and **no**
CAPTCHA handling. If a source needs those, it is not ingestible here — replace
it with an official API or feed, or enter the opportunity manually from the
official notification.

## Source preference order

1. **Official API** published by the employer or authority (Greenhouse, Lever,
   a documented government JSON endpoint).
2. **RSS / Atom feed** — published specifically for machine consumption.
3. **Publicly accessible page**, only where the terms permit it and `robots.txt`
   allows the path.
4. **Manual entry** by an administrator, transcribed from the official
   notification.

## Built-in connectors

| Kind | Access mechanism | Enabled by default |
| --- | --- | --- |
| `MOCK` | Generates synthetic local data. No network calls. | ✅ (development) |
| `GREENHOUSE` | Public documented Job Board API (`boards-api.greenhouse.io`) | ❌ needs board tokens |
| `LEVER` | Public documented postings API (`api.lever.co/v0/postings`) | ❌ needs company slugs |
| `RSS` / `GOVERNMENT_FEED` | Published RSS/Atom document only | ❌ needs feed URLs |
| `JSON_API` | Documented endpoint plus a field mapping | ❌ needs configuration |
| `MANUAL` | Administrator entry | ✅ |

**Every live connector ships disabled with empty configuration.** That is
deliberate: a deployment must consciously verify a source's current terms before
turning it on. The verification is a human step the code cannot do for you.

## Onboarding a source

### An existing kind — no code

Create a `SourceConnector` row through the admin panel or directly:

```json
{
  "name": "Example Corp Careers",
  "slug": "example-corp",
  "kind": "GREENHOUSE",
  "trustLevel": "OFFICIAL",
  "enabled": true,
  "rateLimitPerMinute": 20,
  "scheduleCron": "0 */4 * * *",
  "config": { "boardTokens": ["examplecorp"], "organizationName": "Example Corp" }
}
```

Configuration per kind:

```jsonc
// RSS / GOVERNMENT_FEED
{ "feedUrls": ["https://example.gov.in/notifications.rss"],
  "organizationName": "Example Department", "defaultLocation": "New Delhi" }

// JSON_API — mapping lets a new API be onboarded without code
{ "url": "https://careers.example.com/api/openings",
  "itemsPath": "data.jobs",
  "mapping": { "externalId": "id", "title": "name", "sourceUrl": "absolute_url",
               "description": "content", "location": "location.name" } }

// LEVER
{ "companies": ["examplecorp"], "organizationName": "Example Corp" }
```

### A new kind — one file

Implement `Connector` in `apps/api/src/ingestion/connectors/` and register it in
`connectors/index.ts`. The interface is small:

```ts
export interface Connector {
  kind: string;
  accessPolicy: string;   // recorded on the source row for compliance
  fetch(ctx: ConnectorContext): Promise<RawOpportunity[]>;
}
```

Connectors must use `ctx.fetchText` / `ctx.fetchJson` — never global `fetch` —
so the access rules above always apply.

## What a connector must never do

- Emit a field the source did not publish. Leave it `undefined`; the normalizer
  records "Not Specified".
- Guess an opportunity type, deadline or salary. The classifier and parser do
  that, with confidence scores the validator can act on.
- Fabricate an `externalId`. It must be stable, or every sync creates duplicates.

## Trust levels

| Level | Meaning | Effect |
| --- | --- | --- |
| `OFFICIAL` | Published by the employer or authority | Owns the Apply button after a merge; can reach `VERIFIED` |
| `PARTNER` | An agreed data-sharing arrangement | Publishes as `ACTIVE` |
| `THIRD_PARTY` | Aggregator or unverified | Publishes as `ACTIVE`; contributes to safety scoring |

## Freshness

Runs hourly (`maintenance:freshness`):

- **Expire** anything past its published deadline.
- **Mark expiring soon** anything closing within three days.
- **Re-verify** the least-recently-checked live postings. A 404/410 is proof the
  posting is gone; three consecutive failures mark it `REMOVED`. A network error
  is *not* treated as proof — it marks the row `UNVERIFIED` instead.

A posting that a source stops listing is expired, never silently deleted — and
only when that source was its sole publisher.

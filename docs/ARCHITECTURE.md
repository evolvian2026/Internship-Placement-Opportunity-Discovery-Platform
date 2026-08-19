# Architecture

## Shape

A TypeScript monorepo with three workspaces and one shared contract.

```
packages/shared   ← taxonomy, skill dictionary, DTOs  (the contract)
      ▲                              ▲
      │                              │
  apps/api                       apps/web
  Express + Prisma               Next.js App Router
      │
      ├── src/engines/     pure functions, no I/O
      ├── src/ingestion/   external world → normalised rows
      ├── src/modules/     HTTP surface, one folder per domain
      └── src/queue/       background work
```

`packages/shared` is the reason the two apps cannot drift: the opportunity type
enum, degree labels, application statuses and every DTO are defined once and
imported by both.

## The engines are pure

`src/engines/` contains no Prisma client and no HTTP calls. Every engine is a
function over two plain snapshots:

```ts
evaluateEligibility(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): EligibilitySummaryDto
computeMatch(profile: ProfileSnapshot, opportunity: OpportunitySnapshot): MatchScoreDto
```

This buys three things:

1. **Testability** — 50 engine tests run in 30ms with no database.
2. **Reuse** — the API, the workers and the assistant call the same functions,
   so a score shown on a card is the score used in a digest email.
3. **Replaceability** — swapping the rule-based matcher for a learned ranker
   means changing one function, not tracing scoring logic through controllers.

## Ingestion

```
Connector ──▶ RawOpportunity
                   │
                   ▼
              Parser          extract facts from free text; null when unsure
                   │
                   ▼
             Classifier       type, industry, domain, work mode + confidence
                   │
                   ▼
             Normalizer       one common structure; source beats inference
                   │
                   ▼
        Duplicate detection   fingerprint, then bounded fuzzy comparison
                   │
                   ▼
         Quality validation   reject the unusable, warn about the incomplete
                   │
                   ▼
          Fraud heuristics    cautions for human review, never accusations
                   │
                   ▼
             Persistence      opportunity + eligibility + skills + locations + source
```

Each stage is a separate module with its own tests. A connector that returns
garbage cannot corrupt the database: validation rejects it and the failure is
logged against the ingestion job with the record's external id.

### Duplicate detection

Two stages, because a fuzzy comparison against a million rows is not viable:

1. **Fingerprint** — SHA-1 of (normalised company, normalised title,
   city), stored on the row and indexed. Catches the common
   "same posting on three boards" case in one indexed lookup.
2. **Bounded fuzzy pass** — only against postings from the same organisation in
   the last 120 days. Compares title similarity (Levenshtein ratio), description
   similarity (Jaccard) and canonical application URL.

Company names are normalised before comparison, so "ABC Technologies Pvt. Ltd."
and "ABC Technologies Private Limited" collapse to the same key.

A merge keeps every source reference and re-points the Apply button at the most
official one. The UI can then say "Found on 3 sources" truthfully.

## Matching at scale

Scoring a million opportunities per page view is not an option. Instead:

- Scores are computed in memory for a **page** of results and written to
  `match_scores` asynchronously.
- The personalised feed reads `match_scores` ordered by `overall`, which is an
  indexed database sort, not an in-process one.
- Personalised *sorting* pulls a bounded candidate set (400 rows), scores it and
  pages within it.
- A profile edit deletes that user's cached scores, so nothing goes stale
  silently.

## Background work

```
Scheduler (cron) ──▶ BullMQ queue ──▶ Workers
                                        ├── source connectors
                                        ├── freshness sweep
                                        └── notification digests
```

Retries with exponential backoff (4 attempts, 30s base); failed jobs are
retained as the dead-letter view surfaced in the admin panel.

**Without Redis the system still works.** `queue/scheduler.ts` runs the same job
handlers on in-process timers, so `npm run dev` alone gives a developer
ingestion, expiry and reminders. `enqueue()` falls back to running the job
inline. There is one set of job handlers either way.

## Request lifecycle

```
Request
  → helmet, CORS allow-list, compression
  → rate limiter (global, or tighter for auth/upload/assistant)
  → route
  → requireAuth / optionalAuth / requireRole
  → Zod validation (replaces req.body with the parsed value)
  → service          ← business logic lives here, not in controllers
  → Prisma
  → mapper           ← the single place a row becomes a DTO
  → error middleware ← AppError, Prisma error codes, Multer, unknown
```

`optionalAuth` is what lets one endpoint serve both a crawler and a signed-in
student: the public shape is identical, and match/eligibility/saved fields are
added only when a valid token is present.

## Data model notes

- **Soft deletion** on opportunities and companies — an admin removal is
  reversible and auditable.
- **`mergedIntoId`** rather than deleting a duplicate, so an old link still
  resolves (the detail endpoint follows the pointer).
- **Industries and domains are rows, not enums** — the requirement is that an
  admin can add a domain without a code change, and enums would break that.
- **`opportunity_sources`** is a join table, not a column: an opportunity
  genuinely has many sources.
- **Verbatim `rawText`** is kept on eligibility, so a parsing improvement can be
  re-run later and nothing published is lost.
- **`dedupeHash`** is stored and indexed rather than computed on read.

## Frontend

- **Server components** for public pages (landing, opportunity detail, company
  detail) so they are crawlable and carry JSON-LD.
- **Client components** for everything behind auth, where interactivity matters
  more than first paint.
- **Filter state lives in the URL**, so a filtered search is shareable and
  survives a refresh.
- **Design tokens as CSS custom properties**, with Tailwind mapped onto them —
  light and dark cannot drift because there is one definition.
- **Optimistic updates** on save and follow, reverted on failure.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| API unreachable during build | Landing page renders with zero counts; 10s fetch timeout prevents a hung build |
| Redis unavailable | In-process scheduler takes over; caching becomes a no-op |
| SMTP unconfigured | Emails are logged, in-app notifications still created |
| No `ANTHROPIC_API_KEY` | Deterministic responder answers from the same database rows |
| LLM call fails | Falls back to the deterministic answer — the user always gets one |
| A source fails | That job is marked FAILED with the error; other sources are unaffected |
| A record fails | Counted, logged with its external id, and the run continues |

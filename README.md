# Off-Campus Internship & Placement Opportunity Discovery Platform

A career **discovery engine** for students, fresh graduates and early-career job
seekers in India — not another job board.

For every opportunity it answers four questions:

| Question | How |
| --- | --- |
| **What is available?** | Aggregation from official career pages, government portals, PSU sites and public feeds, normalised into one schema |
| **Am I eligible?** | An eligibility engine that checks degree, branch, batch, CGPA, backlogs, experience, age and citizenship against what the posting actually published |
| **Which are best for me?** | A transparent, explainable match score across six weighted components — gated by eligibility |
| **What next?** | Skill-gap analysis, career readiness, deadline reminders and an application tracker |

---

## Quick start

### Option A — Docker (everything at once)

```bash
cp .env.docker.example .env
# Generate the two secrets the stack refuses to start without:
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 48)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 48)|" .env

docker compose up --build -d
docker compose exec api npx prisma db push
docker compose exec api npm run db:seed
docker compose exec api npm run ingest      # loads sample opportunities
```

Open <http://localhost:3000>.

### Option B — Local development

Requires Node 22+, PostgreSQL 16+ and (optionally) Redis.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

createdb opportunities
npm run build --workspace @odp/shared
npm run db:push
npm run db:seed
npm run ingest --workspace @odp/api    # ~140 sample opportunities

npm run dev                            # API on :4000, web on :3000
npm run dev:worker                     # optional: background jobs
```

### Sign in

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@example.com` | `Student@12345` |
| Admin | `admin@example.com` | `Admin@12345` |

---

## Mock mode

`DATA_SOURCE=mock` (the default) generates ~140 realistic, deterministic sample
opportunities spanning IT, AI, data, finance, marketing, core engineering,
healthcare, manufacturing, research, government and PSU — so the entire UI,
matching engine and analytics stack can be developed and demonstrated with **no
external dependency and no network calls**.

The sample organisations are deliberately fictional. The platform never invents
a real employer's posting.

Switch to `DATA_SOURCE=live` to run the connectors an administrator has enabled.

---

## Architecture

```
                    ┌──────────────┐
   External sources │  Connectors  │  official APIs · RSS · public feeds
   ─────────────────▶  (registry)  │  robots.txt honoured · rate limited
                    └──────┬───────┘
                           ▼
         Raw ──▶ Parser ──▶ Normalizer ──▶ Duplicate detection
                                              │
                        Eligibility extraction │ Classification
                                              ▼
                       Quality validation ──▶ Fraud heuristics
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  PostgreSQL         │
                                   └──────────┬──────────┘
                                              ▼
                       Eligibility engine ──▶ Matching engine
                                              │
                                              ▼
                        Feed · Search · Tracker · Assistant · Admin
```

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind | Server rendering for SEO on public pages, client interactivity elsewhere |
| Backend | Node 22, Express, TypeScript | Small, explicit surface; every module is independently testable |
| Database | PostgreSQL 16 + Prisma | Relational integrity, indexed search, room to grow into partitions |
| Queue | Redis + BullMQ | Retries, exponential backoff, dead-letter inspection |
| Search | PostgreSQL, indexed | Sufficient to a few million rows; swap in OpenSearch behind the same service boundary |
| Storage | Local FS or any S3-compatible endpoint | Resumes never get a public URL |

### Repository layout

```
packages/shared/       Taxonomy, skill dictionary and DTOs shared by API and web
apps/api/
  prisma/schema.prisma The full data model
  src/engines/         Eligibility · matching · skill gap · readiness · recommendations · NLQ
  src/ingestion/       Connectors · parser · normalizer · classifier · dedupe · fraud · validator
  src/modules/         Auth · profile · resume · opportunities · companies · applications ·
                       notifications · dashboard · assistant · admin · taxonomy · seo
  src/queue/           BullMQ queues, workers and an in-process fallback scheduler
  tests/               95 unit + 58 integration tests
apps/web/src/
  app/                 Routes (public, authenticated and admin)
  components/          Design system and feature components
  lib/                 Typed API client
```

---

## Product rules the code enforces

These are invariants, not aspirations — each is covered by tests.

1. **Nothing is invented.** A field the source did not publish renders as
   `Not Specified`. Never a guessed salary, deadline, vacancy count or
   eligibility criterion.
2. **Provenance always survives.** Every opportunity keeps its source name,
   source URL, last-verified timestamp and official application link.
3. **Eligibility gates matching.** A clearly ineligible opportunity is capped at
   35%; one that cannot be confirmed is capped at 82% and labelled
   *Needs Review*. A user is never silently marked eligible.
4. **A posting with no published criteria is never "Eligible ✓".** It is always
   *Needs Review*.
5. **Applications leave the platform.** "Apply" opens the official source. The
   product never implies an application was submitted here.
6. **Access is polite and lawful.** Official APIs are preferred, then public
   feeds. `robots.txt` is honoured, requests are rate limited per host and carry
   a contactable User-Agent. There is no CAPTCHA solving, no login-wall
   traversal and no paywall bypass — by construction, not by policy.
7. **Safety flags are cautions, never accusations.** Suspicious postings are
   marked "Exercise caution" and queued for human review.

---

## Engines

### Eligibility

Pure function over a profile snapshot and an opportunity snapshot. Returns a
verdict plus every check that passed, failed, warned or could not be determined:

```
Eligible ✓
  ✓ B.Tech accepted        ✓ CGPA requirement satisfied (8.4 ≥ 7)
  ✓ CSE accepted           ✓ No active backlogs
  ✓ 2026 graduation accepted
  ⚠ Location preference: Bengaluru
```

Handles B.Tech ≡ B.E. and MBA ≡ PGDM equivalence, branch synonyms
(CSE ≡ Computer Science ≡ Computer Science and Engineering), "All Branches"
postings, and percentage↔CGPA conversion that can only *pass* a candidate,
never fail one.

### Matching

| Component | Weight |
| --- | --- |
| Eligibility | 30% |
| Skills | 25% |
| Education | 15% |
| Experience | 10% |
| Location | 10% |
| Career preference | 10% |

Every component returns its own score and a sentence explaining it. The
structure is what an ML ranker would slot into later — swap the scorer, keep
the contract.

### Natural-language search

`"Government jobs for BTech CSE 2026 in Bengaluru"` becomes:

```json
{ "types": ["GOVERNMENT_JOB"], "degrees": ["B_TECH"],
  "branches": ["CSE"], "graduationYears": [2026], "cities": ["Bengaluru"] }
```

Runs before any LLM is involved, so natural-language search works identically
with or without an API key configured.

---

## The AI assistant

Grounded in the opportunity database by construction:

1. Classify the intent.
2. Query the **real** database through the same search service the UI uses.
3. Build a context block from those rows only.
4. Generate prose from that block.

Without `ANTHROPIC_API_KEY` the deterministic responder answers every supported
question from the same rows — it is a different presentation, not a degraded
answer. With a key, the model only rewrites the grounded context; it is given
no ability to introduce an opportunity, deadline or link of its own.

Every answer cites company, role, eligibility, deadline, source and the official
application link.

---

## Adding a source

No code is needed for a new source of an existing kind — an admin creates a
`SourceConnector` row:

```json
{
  "name": "Example Careers",
  "kind": "GREENHOUSE",
  "trustLevel": "OFFICIAL",
  "config": { "boardTokens": ["examplecorp"], "organizationName": "Example Corp" }
}
```

Built-in kinds: `MOCK`, `RSS`, `JSON_API`, `GREENHOUSE`, `LEVER`,
`GOVERNMENT_FEED`, `MANUAL`.

**Before enabling any live source, verify its current terms and access policy.**
The seeded live connectors ship disabled with empty configuration for exactly
this reason. Each connector documents the access mechanism it relies on, and
that note is stored on the source row.

Adding a new *kind* means adding one `Connector` to
`apps/api/src/ingestion/connectors/`.

---

## Testing

```bash
npm test                    # 153 unit + integration tests
npm run test:e2e            # Playwright, needs the stack running
npm run typecheck
```

| Suite | Covers |
| --- | --- |
| `tests/unit/eligibility` | Degree equivalence, branch synonyms, CGPA, backlogs, age, unknown handling |
| `tests/unit/matching` | Component weights, eligibility gating, deadline suppression, preferences |
| `tests/unit/parser` | Degrees, batches, CGPA, backlogs, experience, vacancies, compensation, deadlines |
| `tests/unit/normalizer` | Location parsing, stipend vs salary, source-over-inference precedence, validation |
| `tests/unit/nlq` | Every example query in the specification |
| `tests/unit/fraud` | Payment demands, bank details, guaranteed jobs, government fee exemption |
| `tests/integration/auth` | Registration, rotation, revocation, account enumeration resistance, RBAC |
| `tests/integration/ingestion` | Pipeline, idempotency, dedupe, merging, expiry |
| `tests/integration/journey` | The full 21-step definition-of-done journey |
| `tests/integration/admin` | Analytics, sources, taxonomy extension, moderation, audit log |

---

## Security & privacy

- bcrypt (cost 12); refresh tokens stored only as SHA-256 hashes and rotated on
  every use
- Role-based access control; Zod validation on every request body and query
- Rate limiting globally, and tighter on auth, upload and assistant endpoints
- Helmet, CORS allow-list, XSS and SQL-injection protection via Prisma
- Resume uploads: magic-byte sniffing, size cap, no public URL, `no-store`
- Users can export everything they hold and delete their account permanently
- Secrets only from the environment; the app refuses to start with weak JWT keys

---

## Performance

Designed for 100k+ users and 1M+ opportunities:

- Indexed on every filter path; facets computed with `groupBy`, not table scans
- Match scores cached in `match_scores` so the personalised feed ranks inside
  Postgres rather than in memory
- Redis read-through caching for taxonomy, counts and analytics
- Bounded candidate sets for personalised ranking (never "load everything")
- Pagination everywhere, cursor support on large result sets
- All source fetching is off the request path, in workers

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — subsystem design and data flow
- [`docs/API.md`](docs/API.md) — endpoint reference
- [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — access policy and connector guide
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what was built, and what extends cleanly

---

## Licence

Provided as-is for the purpose described in the specification.

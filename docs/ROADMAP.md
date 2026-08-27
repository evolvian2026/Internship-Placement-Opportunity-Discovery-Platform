# What was built, and what extends cleanly

## Delivered

### Phase 1 — Foundation
Monorepo with a shared contract package · full PostgreSQL schema (28 models) ·
JWT auth with refresh rotation · profile with education, skills, experience and
preferences · profile completion scoring.

### Phase 2 — Opportunity engine
Controlled taxonomy of 15 opportunity types · 27 industries and 141 domains
(rows, so admins extend them) · search with faceted filters · natural-language
query parsing · detail pages with JSON-LD · SEO landing pages and sitemap.

### Phase 3 — Aggregation
Connector registry (mock, RSS, JSON API, Greenhouse, Lever, government feed,
manual) · polite HTTP layer with robots.txt and rate limiting · parser ·
classifier · normalizer · two-stage duplicate detection with merging · quality
validation · fraud heuristics · freshness sweep with re-verification ·
ingestion jobs and per-record logs.

### Phase 4 — Matching
Eligibility engine with explainable checks and a NEEDS_REVIEW verdict · six-
component weighted match score gated by eligibility · skill matching with a
related-skills graph · cached scores for feed ranking.

### Phase 5 — Career tracking
Saved opportunities · application pipeline with immutable stage history,
recruiter details and reference numbers · deadline buckets · in-app and email
notifications with per-category preferences and dedupe keys.

### Phase 6 — Government & PSU
Dedicated modules with their own categories, vacancy counts, application fees,
exam dates, age limits, citizenship handling and GATE requirements.

### Phase 7 — AI
Career assistant grounded in the database, with a deterministic responder that
needs no API key · natural-language search · skill-gap analysis · career
readiness · career recommendations.

### Phase 8 — Analytics
User analytics (response rate, interviews, offers, skill gaps) · admin analytics
by industry, domain, location, type, sector · data-quality dashboard · ingestion
health · system health · audit log.

### Phase 9 — Production
153 unit and integration tests · Playwright E2E · Docker images for API, worker
and web · compose stack · GitHub Actions CI · security hardening · documentation.

### Guidance layer
Unlock prompts driven by the eligibility engine's own `unknown` checks ·
near-miss analysis with measured, rankable gaps · saved searches with a
per-search alert watermark.

---

## Designed to extend without re-architecting

The specification lists these as future work. Each has a seam already in place.

| Extension | The seam |
| --- | --- |
| ML / semantic matching | `computeMatch` is one pure function returning weighted components. Swap the scorer; the DTO, the cache table and every caller stay. |
| Collaborative filtering | `match_scores` already holds a user × opportunity matrix. |
| Embeddings / vector search | The search service is one module behind `searchOpportunities`; add a vector column and a ranking stage. |
| Elasticsearch / OpenSearch | Same boundary. `buildWhere` is the only place filters compile. |
| Resume optimisation, mock interviews, question banks | The resume parser already produces structured extractions; readiness already has a configurable component list. |
| Course and mentorship recommendations | `recommendations.ts` returns roles, skills, certifications and projects from one entry point. |
| Recruiter / employer portal | `UserRole` is an enum; `Company` and `Opportunity` already model the employer side, and `createdBy` is recorded. |
| University placement portal | Education already carries university and college; a tenant column plus scoped queries is the remaining work. |
| Direct employer applications | `applicationUrl` and the "never pretend" rule are isolated in `OpportunityActions`; a real integration adds a branch there. |

## Deliberate limitations

Stated plainly, because a system that hides these is harder to operate.

- **Live connectors ship disabled.** Verifying a source's terms is a human step.
  The code enforces polite access; it cannot grant permission.
- **Mock data is fictional.** Sample organisations are invented on purpose so a
  demo row can never be mistaken for a real opening.
- **Resume parsing is heuristic.** It proposes; the user confirms. Scanned PDFs
  with no text layer are rejected with a clear message rather than guessed at.
- **Search is PostgreSQL.** Correct and fast to a few million rows. Beyond that,
  the OpenSearch seam above is the intended path.
- **Google sign-in needs configuration.** Without `GOOGLE_CLIENT_ID` the
  endpoint returns 503 rather than pretending to work.
- **Email needs SMTP.** Without it, messages are logged and in-app notifications
  still arrive.

# API reference

Base URL: `http://localhost:4000/api`

Authentication: `Authorization: Bearer <accessToken>`.
Access tokens last 15 minutes; refresh tokens 30 days and rotate on every use.

Errors are uniform:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Validation failed", "details": [...] } }
```

`200` ok · `201` created · `204` no content · `400` validation · `401` unauthenticated ·
`403` forbidden · `404` not found · `409` conflict · `413` too large · `415` unsupported type ·
`429` rate limited · `500` internal · `503` degraded

---

## Auth — `/auth`

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/register` | `{name, email, password}` | Creates profile + notification prefs |
| POST | `/login` | `{email, password}` | Identical error for wrong password and unknown account |
| POST | `/google` | `{idToken}` | Verified against Google tokeninfo |
| POST | `/refresh` | `{refreshToken}` | Rotates; the presented token is revoked |
| POST | `/logout` | `{refreshToken}` | |
| POST | `/logout-all` | — | Auth required |
| POST | `/change-password` | `{currentPassword, newPassword}` | Invalidates every other session |
| GET | `/me` | — | |

## Profile — `/profile`  *(auth required)*

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Full profile with computed completion |
| PUT | `/` | Partial update; sending `education`/`experience` replaces the list |
| POST | `/skills` | Adds without removing existing skills |
| GET | `/export` | Everything held about the user, as a download |
| DELETE | `/account` | Permanent, cascading |

## Resumes — `/resumes`  *(auth required)*

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | |
| POST | `/` | `multipart/form-data`, field `resume`. PDF/DOCX, ≤5 MB, magic-byte checked |
| GET | `/:id/extraction` | The extraction proposal |
| POST | `/:id/apply` | Applies the **user-reviewed** values to the profile |
| GET | `/:id/download` | Owner only, `no-store` |
| DELETE | `/:id` | Purges the file and the extracted text |

Upload returns the proposal; the profile is not modified until `/apply`.

## Opportunities — `/opportunities`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | optional | Search + filters + facets |
| GET | `/internships` | optional | Internship module |
| GET | `/government` | optional | Government + PSU module |
| GET | `/psu` | optional | PSU module |
| GET | `/freshers` | optional | Fresher / off-campus module |
| GET | `/deadlines` | optional | Grouped into closing-soon buckets; `?savedOnly=true` |
| GET | `/counts` | none | Cached counts per type |
| POST | `/recompute-matches` | required | Rebuilds this user's cached scores |
| GET | `/:slugOrId` | optional | Detail; follows a merge pointer |

### Query parameters

Arrays are comma-separated: `?types=INTERNSHIP,FULL_TIME`.

`q` `types` `industries` `domains` `skills` `companyIds` `workModes` `cities`
`states` `countries` `degrees` `branches` `graduationYears` `experienceBands`
`companyTypes` `statuses` `governmentCategories` `psuCategories`
`internshipCategories` `minSalary` `maxSalary` `deadlineWithinDays`
`postedWithinDays` `minMatchScore` `eligibleOnly` `sort` `page` `pageSize`
`nl` (set `false` to disable natural-language parsing)

`sort`: `relevance` · `match` · `deadline` · `newest` · `salary`

### Response

```jsonc
{
  "items": [{
    "id": "…", "slug": "…", "title": "Software Engineer",
    "organizationName": "…", "opportunityType": "FULL_TIME",
    "locationLabel": "Bengaluru / Remote", "salaryLabel": "₹8–12 LPA",
    "educationLabel": "B.Tech / B.E.", "experienceLabel": "Freshers",
    "applicationDeadline": "2026-08-28T00:00:00.000Z",
    "sourceName": "…", "trustLevel": "OFFICIAL", "sourceCount": 3,
    "applicationUrl": "https://…",           // always the official link
    "fraudFlags": [],

    // present only when authenticated:
    "match": { "overall": 92, "components": [...],
               "matchedSkills": [...], "missingSkills": [...] },
    "eligibility": { "verdict": "ELIGIBLE",
                     "passed": [...], "failed": [...],
                     "warnings": [...], "unknown": [...] },
    "isSaved": false, "applicationStatus": null
  }],
  "total": 138, "page": 1, "pageSize": 20, "totalPages": 7,
  "facets": { "types": [...], "industries": [...], "cities": [...], ... },
  "interpretation": "Searching government jobs · B.Tech · CSE · in Bengaluru",
  "interpretedFilters": { "types": ["GOVERNMENT_JOB"], "degrees": ["B_TECH"] }
}
```

The detail endpoint adds description, responsibilities, requirements, selection
process, documents, structured `eligibilityDetail` (including verbatim
`rawText`), important dates, every `sources` entry, and an `seo` block carrying
JSON-LD `JobPosting`.

## Companies — `/companies`

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/` | optional | `?q&companyTypes&industries&hiringOnly&page&pageSize` |
| GET | `/following` | required | |
| GET | `/:slugOrId` | optional | Includes live openings |
| POST | `/:id/follow` | required | |
| DELETE | `/:id/follow` | required | |

## Applications — `/applications`  *(auth required)*

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | `?statuses&page&pageSize` |
| GET | `/pipeline` | Grouped by stage, for the board |
| GET | `/analytics` | Response rate, interviews, offers, skill gaps |
| POST | `/` | `{opportunityId, status?, notes?}` — 409 if already tracked |
| GET | `/:id` | |
| PATCH | `/:id` | Status change appends an immutable event |
| DELETE | `/:id` | |

Statuses: `SAVED` `INTERESTED` `APPLIED` `ASSESSMENT` `INTERVIEW`
`TECHNICAL_INTERVIEW` `HR_INTERVIEW` `OFFER` `REJECTED` `WITHDRAWN`

## Saved — `/saved`  *(auth required)*

`GET /` · `POST /` `{opportunityId, note?}` · `DELETE /:opportunityId`

## Dashboard — `/dashboard`  *(auth required)*

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Greeting, stats, recommended, closing soon, applications, readiness |
| GET | `/readiness` | Score with a weight and hint per component |
| GET | `/skill-gap` | `?opportunityId=` for one, omit for the matched market |
| GET | `/recommendations` | Roles, skills, industries, companies, certifications, projects |

## Notifications — `/notifications`  *(auth required)*

`GET /` · `POST /:id/read` · `POST /read-all` · `GET /preferences` · `PUT /preferences`

## Assistant — `/assistant`  *(auth required)*

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/prompts` | Suggested questions |
| GET | `/conversations` | |
| GET | `/conversations/:id` | |
| DELETE | `/conversations/:id` | |
| POST | `/ask` | `{question, conversationId?}` — rate limited to 20/min |

Every reply carries `citations`, each with company, role, eligibility, deadline,
source and official application link — and each references a real database row.

## Taxonomy — `/taxonomy`

`GET /` returns industries (with domains), skills, opportunity types, degrees,
work modes, experience bands, deadline buckets, company types and every module's
category list. Cached 5 minutes. Admin-created domains appear immediately.

## SEO — `/seo`

`GET /landing-pages` · `GET /landing-pages/:path` · `GET /sitemap?page=n`

## Admin — `/admin`  *(admin role required)*

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/analytics` | Platform totals and breakdowns |
| GET | `/data-quality` | Completeness and review queues |
| GET | `/system-health` | DB latency, queue depth, failed jobs |
| GET | `/audit-log` | Every administrative action |
| GET | `/opportunities` | Search across every status |
| POST | `/opportunities` | Manual entry, attributed to the manual source |
| PATCH | `/opportunities/:id` | Invalidates cached match scores |
| POST | `/opportunities/:id/status` | Verify / expire / remove |
| DELETE | `/opportunities/:id` | Soft delete |
| GET | `/duplicates` | Candidate groups |
| POST | `/duplicates/merge` | `{survivorId, duplicateId}` |
| GET | `/flagged` | Safety-flagged postings |
| GET | `/users` · POST `/users/:id/role` | Cannot demote yourself |
| GET | `/sources` · PATCH `/sources/:id` | |
| POST | `/sources/:id/run` | `?sync=true` to run inline |
| GET | `/ingestion/jobs` · `/ingestion/jobs/:id/logs` | |
| POST | `/industries` · `/domains` | Extend the taxonomy without deploying |

## Health

`GET /health` (liveness) · `GET /api/health` (readiness: database, Redis, data source)

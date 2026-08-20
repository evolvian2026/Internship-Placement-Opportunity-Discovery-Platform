# Live verification harnesses

These drive a **running deployment** over HTTP — no test database, no mocks.
Use them to check a real environment after a deploy, where the unit and
integration suites cannot reach.

```bash
# Point them at whatever is running (defaults to localhost:4000).
python3 scripts/e2e/verify-student-journey.py
python3 scripts/e2e/verify-admin-and-security.py
```

| Harness | Covers |
| --- | --- |
| `verify-student-journey.py` | The 52-item definition of done: signup, profile, search, natural language, the four modules, eligibility and match gating, detail and SEO, skill gap, save/apply/track, deadlines, dashboard, assistant grounding, export and deletion |
| `verify-admin-and-security.py` | Analytics, ingestion control, moderation, runtime taxonomy extension, audit log, RBAC, cross-tenant isolation, input validation and injection resistance |

Both exit non-zero on the first failure, so they can gate a release.

They expect a seeded database (`npm run db:seed && npm run ingest -w @odp/api`)
and the `admin@example.com` / `student@example.com` accounts that seed creates.
The student journey creates and then deletes its own throwaway account.

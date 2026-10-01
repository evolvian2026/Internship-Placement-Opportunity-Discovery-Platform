# Deployment

The stack is three moving parts — a Next.js web app, an Express API, and
PostgreSQL — plus an optional Redis. Redis is genuinely optional: with
`REDIS_URL` empty the API runs the recurring jobs in-process, so a showcase
deployment can leave it out entirely.

## A free stack for a public demo

Free tiers move constantly; verify the current terms before relying on any of
this. As of early 2026:

| Part | Where | Why |
| --- | --- | --- |
| Web (Next.js) | Vercel free | Built for Next.js; no sleep on static/SSR pages |
| API (Express) | Render free web service | Free indefinitely, 512 MB / 0.1 CPU |
| PostgreSQL | Neon free | Stays free; 0.5 GB per project |
| Redis | omit, or Upstash free | The API falls back to its in-process scheduler |

Two caveats that matter for a demo:

- **Render free services sleep after ~15 minutes idle.** The first request after
  that takes 30–60 seconds to wake. Mention it to whoever you are showing, or
  warm it just before.
- **Do not use Render's free Postgres.** It expires 30 days after creation, with
  a 14-day grace period, and then the data is deleted. Neon's free tier has no
  such expiry — it only suspends compute after a few minutes idle and resumes on
  the next connection.

Supabase also has a permanent free Postgres, but free projects pause after a
week of inactivity, which is the wrong failure mode for something you show
occasionally. Fly.io removed its free tier, and Railway now runs on trial
credit rather than a free allowance.

## Order of operations

Deploy the API first — the web build needs its public URL.

### 1. Database (Neon)

Create a project and take the **pooled** connection string. Prisma talks to
Neon through PgBouncer, so append the pooling flags and keep the client's own
pool small:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require&pgbouncer=true&connection_limit=5
```

`connection_limit` in the URL wins over `DATABASE_CONNECTION_LIMIT`, which is
what you want here: the default of 25 is sized for a dedicated Postgres, not a
shared pooler.

### 2. API (Render)

Create a **Web Service** from the repository, root directory `.`:

- Build: `npm ci && npm run build --workspace @odp/shared && npm run build --workspace @odp/api`
- Start: `node apps/api/dist/src/server.js`
- Health check path: `/health`

Environment:

```
NODE_ENV=production
DATABASE_URL=<the Neon pooled URL above>
JWT_ACCESS_SECRET=<openssl rand -hex 48>
JWT_REFRESH_SECRET=<openssl rand -hex 48>
REDIS_URL=                       # empty: in-process scheduler
QUEUE_ENABLED=false
DATA_SOURCE=mock
INGESTION_ENABLED=true
WEB_BASE_URL=https://<your-app>.vercel.app
PUBLIC_SITE_URL=https://<your-app>.vercel.app
```

`WEB_BASE_URL` and `PUBLIC_SITE_URL` are not cosmetic — they are the CORS
allowlist. If they do not exactly match the browser's origin, including the
scheme and any `www`, every request from the web app is rejected.

Then prepare the database once, from Render's shell or any machine with the
`DATABASE_URL` exported:

```bash
npx prisma db push --schema apps/api/prisma/schema.prisma --skip-generate
npm run db:seed --workspace @odp/api
npm run ingest --workspace @odp/api      # ~140 sample opportunities
```

### 3. Web (Vercel)

Import the repository, set the root directory to `apps/web`, and add:

```
API_BASE_URL=https://<your-api>.onrender.com
NEXT_PUBLIC_API_BASE_URL=https://<your-api>.onrender.com
NEXT_PUBLIC_SITE_URL=https://<your-app>.vercel.app
```

`API_BASE_URL` is what server components use; the two `NEXT_PUBLIC_` values are
compiled into the browser bundle **at build time**. Changing either one needs a
redeploy, not a restart — a stale value here is the usual reason a deployed
front end still calls `localhost:4000`.

Vercel assigns the app's URL on first deploy, so expect to go back and correct
`WEB_BASE_URL` / `PUBLIC_SITE_URL` on the API once you know it, then redeploy
the web app with the final values.

### 4. Sign in

The seed creates `student@example.com` / `Student@12345` and
`admin@example.com` / `Admin@12345`. **Change or remove these before putting
the demo anywhere public** — they are published credentials with admin access.

## Self-hosting with Docker

`docker compose up --build` brings up the whole stack, including a one-shot
`migrate` service that applies the schema, seeds and loads the sample
catalogue before the API starts. See the README for the host-port and
`NEXT_PUBLIC_API_BASE_URL` notes.

To put that behind a domain, terminate TLS in front of it (Caddy or nginx),
point `WEB_BASE_URL`, `PUBLIC_SITE_URL` and `NEXT_PUBLIC_*` at the public
hostname, rebuild the web image, and stop publishing the Postgres and Redis
ports to the host.

## What is not configured for you

- **Backups.** Neon keeps a restore window on its free tier; a self-hosted
  Postgres has nothing until you add `pg_dump` on a schedule.
- **Error tracking.** The API logs structured JSON to stdout. Nothing ships it
  anywhere.
- **SMTP.** With `SMTP_HOST` empty, mail is logged rather than sent. Alerts and
  deadline reminders are generated either way; they just do not leave the box.

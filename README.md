# Whitecarrot Admin Panel

A read-only internal dashboard over our two Supabase projects:

| View | Source | What it answers |
|---|---|---|
| **Overview** | both | Pipeline funnel (scraped → matched → live → synced → fresh on JD → applications), health of each automated step, GTM ↔ JD drift |
| **Outbound Jobs Collection** | GTM project (`jobs`, `job_scan_runs`, `companies`, `company_outbound_status`) | How many jobs we've scraped, how fresh they are (Fresh ≤7d · Live ≤30d · Aging ≤60d · Stale), market / function / seniority / industry, and how far outreach to each hiring company has got |
| **JD Jobs Published** | Jobs Duniya project (`jobs`, `companies`, `gtm_sync_state`) | What the site lists, stored flag *and* effective status (Active·fresh / Active·stale / Expired / Demo), country, role, industry, reconciliation with GTM |
| **JD Application Collection** | Jobs Duniya project (`chat_interactions`, Storage `resumes`) | Submissions over time, roles candidates want, when they apply, applicant list with signed resume links |

## Run locally

```bash
npm install
npm run dev          # http://localhost:3100
npm test             # bucket / filter unit tests
```

Copy `.env.example` → `.env`. Without `AUTH_GOOGLE_ID` the panel runs with login off, **locally only**. In production it refuses to serve (503) until login is configured.

## Deploy (Vercel)

1. Import this folder as a project. Framework: Next.js.
2. Env vars: `GTM_SUPABASE_DB_URL`, `JD_SUPABASE_DB_URL` (use the **transaction pooler, port 6543**), `JD_SUPABASE_URL`, `JD_SUPABASE_SERVICE_ROLE_KEY`, `JD_SITE_URL`, `AUTH_SECRET` (`npx auth secret`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN=whitecarrot.io`, `HUBSPOT_ACCESS_TOKEN` (private app with companies + contacts **read** scopes), `INSTANTLY_API_KEY` (or the older lowercase `instantly_api_key`).
3. Google OAuth client: authorised redirect URI `https://<your-domain>/api/auth/callback/google`.

The panel reads HubSpot (Data space, Reached out) and Instantly (Outbound email) through their APIs, read-only. It doesn't use the other keys in the local `.env` (Apify, OpenAI…).

## How it's built

- Next.js 15 App Router, all data access in server components (`lib/queries/*`). No key reaches the browser.
- Raw SQL over `pg` to both databases. Every query runs in its own `BEGIN READ ONLY` transaction with a 20s timeout (`lib/db/pool.ts`). The Supabase pooler ignores startup options, so this is enforced per query. `/api/health` proves it by attempting a zero-row `UPDATE`, which Postgres rejects.
- Aggregates are cached for 10 minutes (`lib/cache.ts`); the **Refresh** button drops the cache. Applicant rows are never cached.
- Filters (range, market, status, search, page, open drawer) live in the URL, so any view can be shared.
- Normalisation rules (job function, country from free-text location, role from free-text "role looking for") are plain data in `lib/buckets.ts`, used by both SQL and TypeScript, with tests.
- Charts follow one palette: brand violet for single series, a blue ordinal ramp for age buckets, and reserved status colours used only with a text label.

## Known data gaps (fix in the source apps)

- `chat_interactions` has no job id, UTM, referrer or entry mode, so "where candidates come from" can't be answered yet. Add the columns in `bolt-jobs-duniya`, and the panel's source card is ready for them.
- The JD sync has no run history table, so sync health is inferred from `gtm_sync_state` and `max(updated_at)`.

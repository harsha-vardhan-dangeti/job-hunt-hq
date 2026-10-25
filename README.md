# Job Hunt HQ

A private tracker for a Backend + AI / Forward Deployed Engineer job hunt. Next.js App
Router, Supabase, no client-side framework beyond React. Built to run on Vercel's free tier
and to be written to by a scheduled agent over a small REST API.

Ships with a snapshot of 74 tracked roles in `seed/jobs.json`.

---

## Deploy to Vercel

**1. Get the code onto GitHub.**

```bash
git init
git add -A
git commit -m "Job Hunt HQ"
git remote add origin git@github.com:<you>/job-hunt-hq.git
git push -u origin main
```

**2. Import it on Vercel.** vercel.com → Add New → Project → pick the repo → Deploy.
No build settings to change; Next.js is detected.

**3. Add Supabase.** In the project: Storage → Create Database → Supabase (or connect an
existing Supabase project). Vercel injects `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
automatically. Redeploy after attaching.

**4. Create the tables.** Link the CLI to the project and push the migration in
`supabase/migrations/`:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

**5. Set the remaining environment variables.** Project → Settings → Environment Variables:

| Variable | Value |
| --- | --- |
| `AGENT_TOKEN` | a long random string — `openssl rand -hex 24` |
| `APP_PASSWORD` | the password you'll type to open the site |

Redeploy so they take effect.

**6. Import the 74 rows.** Once:

```bash
curl -X POST https://<your-app>.vercel.app/api/seed \
  -H "Authorization: Bearer $AGENT_TOKEN"
```

It replies `{"imported":74}`. Re-running it is safe — existing rows are left alone and it
replies with how many new rows it added (`0`).

**7. Open the site**, type your `APP_PASSWORD`, and the tracker is live.

### Keeping it private

`APP_PASSWORD` is a single shared password, good enough for a personal tracker nobody is
targeting. For a second lock, turn on Vercel Authentication (Settings → Deployment
Protection), which requires your Vercel login before the site loads at all. The API routes
stay reachable by the agent because they authenticate with a bearer token, not a cookie.

---

## Running locally

```bash
npm install
supabase start                 # local Supabase in Docker; applies supabase/migrations/
cp .env.example .env.local     # fill in SUPABASE_URL, SUPABASE_SECRET_KEY, AGENT_TOKEN
npm run dev
```

`supabase start` prints the local API URL and secret key; `supabase status` shows them again.
Or point `.env.local` at your hosted project instead.

With no Supabase credentials the site still boots and renders the seed snapshot read-only — handy
for checking the UI, useless for tracking anything.

---

## What's on the page

- **Today** — up to five things to do now: interviews and live deadlines first, then follow-ups
  that have come due, roles you pinned, and fit-4+ roles with a draft but no message sent.
  "Mark sent" sets `messagedOn`, moves the row to `outreach` and books a follow-up in 5 days.
  Every one-click action has an Undo.
- **Decide or drop** — rows whose deadline has passed, and wishlist rows untouched for 10+ days.
  Do now, snooze 3 days, or drop.
- **Insights** — sent this week against the 12-a-week target, your daily streak, a 14-day chart of
  messages sent and applications, and the funnel with its weakest step called out.

---

## The API

Every route, reads included, needs `Authorization: Bearer $AGENT_TOKEN` or a signed-in browser
session. Without either it returns 401.

| Method | Path | Does |
| --- | --- | --- |
| `GET` | `/api/jobs` | every row |
| `POST` | `/api/jobs` | create a row (or an array of rows); generates an id from company + role if none given |
| `PATCH` | `/api/jobs/{id}` | merge fields into one row — the one the agent uses most |
| `PUT` | `/api/jobs/{id}` | replace a row wholesale |
| `DELETE` | `/api/jobs/{id}` | remove a row |
| `GET` | `/api/brief` | today's brief |
| `PUT` | `/api/brief` | replace today's brief |
| `POST` | `/api/seed` | one-time import of `seed/*.json` |

```bash
# mark a role as interviewing
curl -X PATCH https://<app>.vercel.app/api/jobs/databricks-ai-engineer-fde \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"status":"interviewing","interviewAt":"2026-11-04T15:30"}'
```

### Row fields

`company`, `role`, `jobId`, `url`, `status`, `fit` (1–5), `source`, `addedOn`, `postedOn`,
`contact`, `contactUrl`, `messagedOn`, `followUpOn`, `deadline`, `interviewAt`, `draft`,
`prepBrief`, `notes`, `snoozedUntil`, `pinnedOn`.

`snoozedUntil` hides a row from Today and Decide-or-drop until that date. `pinnedOn` is set by
"Do now" and puts the row at the top of Today until a message is sent.

`status` is one of `wishlist`, `outreach`, `applied`, `interviewing`, `offer`, `rejected`,
`dropped`. Dates are `YYYY-MM-DD`; `interviewAt` is `YYYY-MM-DDTHH:MM` in IST.

### Activity log

Every change to `status`, `interviewAt`, `deadline` or `messagedOn` writes a row to the
`events` table, whether it came from the browser, the agent, or a hand edit in Supabase
Studio — a Postgres trigger does the logging. That's what the Activity
panel shows, and what makes the weekly funnel numbers real rather than guessed.

---

## Repointing the scheduled agent

The morning agent, the evening interview-prep task and the Sunday review currently read and
write the Claude artifact. To move them here, replace the tracker paragraph in each task's
prompt with:

> Tracker: `https://<your-app>.vercel.app`. Read `GET /api/jobs` and `GET /api/brief`.
> Write with `PATCH /api/jobs/{id}` (merge), `POST /api/jobs` (new rows) and
> `PUT /api/brief`. Every write needs the header `Authorization: Bearer <AGENT_TOKEN>`.
> Never delete rows.

Ask Claude to do it and hand over the URL and token.

---

## Layout

```
app/
  page.jsx              server component — loads rows, brief and activity
  layout.jsx            fonts and shell
  globals.css           the whole design system, tokens first
  login/page.jsx        password gate
  api/jobs/route.js     list + create
  api/jobs/[id]/route.js  update + delete
  api/brief/route.js    read + replace the brief
  api/seed/route.js     one-time import
  api/auth/route.js     sign in / out
components/Tracker.jsx  board, table, detail editor, activity
lib/supabase.js         server-only Supabase client (secret key)
lib/db.js               data access and seed fallback
lib/auth.js             bearer token and session checks
proxy.js                redirects to /login when APP_PASSWORD is set
seed/                   the exported snapshot
supabase/migrations/    schema, RLS, event-log trigger, merge_job() and import_seed()
```

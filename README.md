# Job Hunt HQ

A private tracker for a Backend + AI / Forward Deployed Engineer job hunt. Next.js App
Router, Postgres, no client-side framework beyond React. Built to run on Vercel's free tier
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

**3. Add a database.** In the project: Storage → Create Database → Neon (Postgres).
Vercel injects `DATABASE_URL` and `POSTGRES_URL` automatically. Redeploy after attaching.

**4. Set the remaining environment variables.** Project → Settings → Environment Variables:

| Variable | Value |
| --- | --- |
| `AGENT_TOKEN` | a long random string — `openssl rand -hex 24` |
| `APP_PASSWORD` | the password you'll type to open the site |

Redeploy so they take effect.

**5. Import the 74 rows.** Once:

```bash
curl -X POST https://<your-app>.vercel.app/api/seed \
  -H "Authorization: Bearer $AGENT_TOKEN"
```

It replies `{"imported":74}`. Re-running it is safe — existing rows are left alone.

**6. Open the site**, type your `APP_PASSWORD`, and the tracker is live.

### Keeping it private

`APP_PASSWORD` is a single shared password, good enough for a personal tracker nobody is
targeting. For a second lock, turn on Vercel Authentication (Settings → Deployment
Protection), which requires your Vercel login before the site loads at all. The API routes
stay reachable by the agent because they authenticate with a bearer token, not a cookie.

---

## Running locally

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL, AGENT_TOKEN
npm run dev
```

With no `DATABASE_URL` the site still boots and renders the seed snapshot read-only — handy
for checking the UI, useless for tracking anything.

---

## The API

Writes need `Authorization: Bearer $AGENT_TOKEN` (or a signed-in browser session). Reads are
behind the same password gate as the site.

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
`prepBrief`, `notes`.

`status` is one of `wishlist`, `outreach`, `applied`, `interviewing`, `offer`, `rejected`,
`dropped`. Dates are `YYYY-MM-DD`; `interviewAt` is `YYYY-MM-DDTHH:MM` in IST.

### Activity log

Every change to `status`, `interviewAt`, `deadline` or `messagedOn` writes a row to the
`events` table, whether it came from the browser or the agent. That's what the Activity
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
lib/db.js               Postgres access, schema, seed fallback, event log
lib/auth.js             bearer token and session checks
proxy.js                redirects to /login when APP_PASSWORD is set
seed/                   the exported snapshot
```

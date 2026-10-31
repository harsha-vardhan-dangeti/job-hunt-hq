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
| `ALLOWED_EMAILS` | the Google account(s) allowed to sign in |
| `APP_PASSWORD` | optional password fallback; remove once Google sign-in works |

Redeploy so they take effect.

**6. Import the 74 rows.** Once:

```bash
curl -X POST https://<your-app>.vercel.app/api/seed \
  -H "Authorization: Bearer $AGENT_TOKEN"
```

It replies `{"imported":74}`. Re-running it is safe — existing rows are left alone and it
replies with how many new rows it added (`0`).

**7. Open the site** and sign in (see *Signing in* below).

### Signing in

Sign in with Google, from any device. Only the accounts in `ALLOWED_EMAILS` get in; anyone
else is signed straight back out. Supabase Auth handles the Google sign-in, and the app only
reads the verified email from the session.

One-time setup:

1. **Google Cloud Console** → APIs & Services → Credentials → Create credentials → OAuth
   client ID → *Web application*.
   - Authorized JavaScript origins: `https://<your-app>.vercel.app`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`

   On the OAuth consent screen, leave the app in *Testing* and add your Gmail as a test user:
   Google then refuses everyone else before they reach the app.
2. **Supabase** → Authentication → Sign In / Providers → Google: turn it on, paste the client
   ID and secret, save.
3. **Supabase** → Authentication → URL Configuration: Site URL `https://<your-app>.vercel.app`;
   add `https://<your-app>.vercel.app/**` (and `http://localhost:3000/**` for local work) to
   Redirect URLs.
4. Set `ALLOWED_EMAILS` in Vercel and redeploy.

Once Google sign-in works, delete `APP_PASSWORD` from Vercel to turn the password off, and in
Supabase turn off *Allow new users to sign up* so no one else can even create an account.
The API routes stay reachable by the agent, which uses its bearer token.

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

Seven sections, in the top bar on desktop and a bottom tab bar on phones (keys 1–7 switch,
`/` searches). Click any role anywhere to open its panel: a stage tracker you can click to
move it, what it needs next, its full history, and every field.

- **Today** — up to five things to do now: interviews and live deadlines first, then follow-ups
  that have come due, roles you pinned, and fit-4+ roles with a draft but no message sent.
  "Mark sent" sets `messagedOn`, moves the row to `outreach` and books a follow-up in 5 days.
  Every one-click action has an Undo.
- **Decide or drop** — rows whose deadline has passed, and wishlist rows untouched for 10+ days.
  Do now, snooze 3 days, or drop.
- **Brief** — the agent's morning brief on its own page, sized for reading: to-dos in order,
  inbox notes, the Naukri headline and market notes.
- **Resumes** — a resume tailored to each fit-4+ role, built only from the master resume you
  paste in once. The agent puts the matching experience first in the role's own words, lists what
  the role asks for that you don't have as gaps (left out, never claimed), and the page flags any
  employer, title, skill or number that isn't in the master. Download PDF prints a clean,
  single-column page that applicant-tracking systems can read. The agent tailors up to three each
  morning; **Tailor resume** on a role asks for one right away.
  Each tailored resume gets an **ATS score** out of 100 against the role's job description:
  keywords (60), job-title words (10), sections (20), length and bullets (10). A keyword only
  counts if the master resume backs it up, so adding a skill you don't have can't raise it. The
  agent revises towards 90 using only what the master has; what's left under 90 is listed as
  keywords to add to the master, if they're true.
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
| `GET` | `/api/resume` | the master resume, `{text, updatedOn}` |
| `PUT` | `/api/resume` | replace the master resume |
| `POST` | `/api/ats` | score a resume for a role, `{jobId, resume?, jd?}`; saves nothing |
| `POST` | `/api/agent/run` | start the agent; with `{"jobId": "…"}` it only tailors that role's resume |
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
`prepBrief`, `notes`, `snoozedUntil`, `pinnedOn`, `jd` (the job description), `resume` (the
tailored resume), `resumeRequestedOn`.

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

### Run the agent from the site

The **Run agent now** button on the brief card starts the morning routine immediately through
its API trigger, instead of waiting for the 8:30 weekday run. To connect it:

1. claude.ai/code/routines → the routine → **Edit** → **Trigger** row → **+** → **API**.
   Copy the routine id from the Fire URL (`trig_…`), then **Generate token** and copy it
   (shown once).
2. Add both to Vercel and redeploy:

   ```bash
   vercel env add AGENT_ROUTINE_ID production      # trig_…
   vercel env add AGENT_ROUTINE_TOKEN production --sensitive
   ```

Until both are set the button stays disabled. A routine can be fired 30 times an hour.

---

## Layout

```
app/
  page.jsx              server component — loads rows, brief and activity
  layout.jsx            fonts and shell
  globals.css           the whole design system, tokens first
  login/page.jsx        sign-in page (Google, optional password)
  auth/callback/route.js  finishes Google sign-in, checks the allow-list
  api/jobs/route.js     list + create
  api/jobs/[id]/route.js  update + delete
  api/brief/route.js    read + replace the brief
  api/resume/route.js   read + replace the master resume
  api/ats/route.js      ATS score for a draft or saved resume
  api/seed/route.js     one-time import
  api/auth/route.js     sign in / out
components/
  Tracker.jsx           app shell: nav, sections, role panel, undo toast
  Nav.jsx               sidebar on desktop, icon rail on tablets, tab bar on phones
  TodayView.jsx         next move, the rest of the queue, decide or drop, link to the brief
  BriefView.jsx         the morning brief, full page
  ResumesView.jsx       master resume, tailored resume per role, ATS score, fact check, PDF
  resume.js             which roles need a resume, the fact check, plain-text export
  ats.js                the ATS score: keywords, title, sections, length
  ListViews.jsx         filters, Pipeline board (drag to change stage), Roles table
  RoleDrawer.jsx        one role: stage tracker, next step, history, all fields
  InsightsView.jsx      pace, weekly target, streak, chart, funnel, sources
  ActivityView.jsx      every change in the last 90 days, by day
  model.js              statuses, dates, queue rules (no React)
lib/supabase.js         server-only Supabase client (secret key)
lib/db.js               data access and seed fallback
lib/auth.js             bearer token and session checks
lib/gate.js             who may sign in (ALLOWED_EMAILS, APP_PASSWORD)
lib/session.js          Supabase Auth session for the current request
proxy.js                refreshes the session, sends anyone signed out to /login
seed/                   the exported snapshot
supabase/migrations/    schema, RLS, event-log trigger, merge_job() and import_seed()
```

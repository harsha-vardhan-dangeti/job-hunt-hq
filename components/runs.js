/* Agent runs as the site sees them. The site records a run when its button
   starts one, and the agent reports each step to /api/agent/progress as it
   works, so the page can show the run live. No React here: the API route and
   the page share these rules. */

/** The steps each kind of run goes through, in order, as the routine prompt
 *  names them. The agent sends these keys. */
export const RUN_STEPS = {
  morning: [
    ['tracker', 'Read the tracker'],
    ['gmail', 'Check Gmail'],
    ['calendar', 'Update the calendar'],
    ['search', 'Search for new roles'],
    ['add', 'Add new roles'],
    ['jds', 'Read job descriptions'],
    ['drafts', 'Write referral drafts'],
    ['resumes', 'Tailor resumes'],
    ['followups', 'Draft follow-ups'],
    ['stale', 'Flag stale roles'],
    ['brief', 'Write the brief'],
  ],
  resume: [
    ['tracker', 'Read the tracker'],
    ['resume', 'Tailor the resume'],
  ],
  jds: [
    ['tracker', 'Read the tracker'],
    ['jds', 'Read job descriptions'],
  ],
};

export const RUN_TITLE = {
  morning: 'Morning run',
  resume: 'Resume tailoring',
  jds: 'Job descriptions',
};

const KINDS = Object.keys(RUN_STEPS);
const STEP_STATUS = new Set(['running', 'done', 'skipped', 'failed']);
const STEP_KEY = /^[a-z][a-z0-9-]{0,30}$/;
export const KEEP_RUNS = 10;
const MAX_STEPS = 30;

/* A run counts as live while it's had news in this long. A morning run takes
   10–20 minutes, but a single step (a long search) can sit quiet for a while. */
const OPEN_MS = 60 * 60 * 1000;
/* Past this with no news, the page says the run has gone quiet. */
export const QUIET_MS = 20 * 60 * 1000;
/* A run the button started that the agent never reported on. */
export const NO_SHOW_MS = 5 * 60 * 1000;

const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export function isOpen(run, now = Date.now()) {
  return Boolean(run) && (run.status === 'starting' || run.status === 'running') && now - Date.parse(run.updatedAt) < OPEN_MS;
}

/** 'starting' | 'running' | 'quiet' (no news for a while) | 'noshow' (never
 *  checked in) | 'done' | 'failed' | 'lost' (went quiet and never finished). */
export function runState(run, now = Date.now()) {
  if (!run) return null;
  if (run.status === 'done' || run.status === 'failed') return run.status;
  const idle = now - Date.parse(run.updatedAt);
  if (!isOpen(run, now)) return run.status === 'starting' ? 'noshow' : 'lost';
  if (run.status === 'starting') return idle > NO_SHOW_MS ? 'noshow' : 'starting';
  return idle > QUIET_MS ? 'quiet' : 'running';
}

/** The planned steps with what the agent has reported filled in, plus any
 *  step it reported that the plan doesn't name, in the order reported. */
export function stepsFor(run) {
  const plan = RUN_STEPS[run.kind] || [];
  const got = new Map((run.steps || []).map((s) => [s.key, s]));
  const out = plan.map(([key, label]) => ({ key, label, status: 'pending', ...got.get(key) }));
  for (const s of run.steps || []) {
    if (!plan.some(([k]) => k === s.key)) out.push({ label: s.key, ...s });
  }
  return out;
}

/** A new run, as the site records it when its button starts one. */
export function newRun({ kind, trigger, sessionUrl = null, label = '', now = new Date() }) {
  const at = now.toISOString();
  return {
    id: `run-${now.getTime().toString(36)}`,
    kind: KINDS.includes(kind) ? kind : 'morning',
    trigger,
    label: clip(label, 140),
    sessionUrl,
    status: 'starting',
    startedAt: at,
    updatedAt: at,
    finishedAt: null,
    summary: '',
    steps: [],
  };
}

/** Checks one progress report from the agent. Returns the error text, or ''. */
export function badReport(b) {
  if (!b || typeof b !== 'object') return 'Send a JSON object.';
  if (!STEP_KEY.test(String(b.step || ''))) return 'Send "step": a short lowercase key such as "gmail", or "finish".';
  if (!STEP_STATUS.has(b.status)) return 'Send "status": running, done, skipped or failed.';
  if (b.kind !== undefined && !KINDS.includes(b.kind)) return `"kind" must be one of: ${KINDS.join(', ')}.`;
  return '';
}

/** Applies one progress report to the run list (newest first) and returns the
 *  new list. A report with "kind" starts a run: it takes over the run the
 *  button just started, or opens a new one for a scheduled run. Any other
 *  report goes to the newest live run, or opens one if there's none. */
export function applyReport(runs, b, now = new Date()) {
  const t = now.getTime();
  const at = now.toISOString();
  const list = [...(runs || [])];
  let run = list[0] && isOpen(list[0], t) ? { ...list[0] } : null;

  if (b.kind && run && !(run.status === 'starting' && run.kind === b.kind)) run = null;
  if (!run) {
    run = newRun({ kind: b.kind || 'morning', trigger: 'schedule', now });
    list.unshift(run);
  }
  if (b.label) run.label = clip(b.label, 140);
  run.status = 'running';
  run.updatedAt = at;

  const steps = (run.steps || []).map((s) => ({ ...s }));
  if (b.step === 'finish') {
    for (const s of steps) if (s.status === 'running') Object.assign(s, { status: 'done', endedAt: at });
    run.status = b.status === 'failed' ? 'failed' : 'done';
    run.finishedAt = at;
    run.summary = clip(b.detail, 600);
  } else {
    // A step starting means the one before it has ended, even if the agent didn't say.
    if (b.status === 'running') {
      for (const s of steps) if (s.status === 'running' && s.key !== b.step) Object.assign(s, { status: 'done', endedAt: at });
    }
    let s = steps.find((x) => x.key === b.step);
    if (!s) {
      if (steps.length >= MAX_STEPS) return list;
      s = { key: b.step, startedAt: at };
      steps.push(s);
    }
    s.status = b.status;
    if (b.detail !== undefined) s.detail = clip(b.detail, 300);
    if (b.status === 'running') s.startedAt = s.startedAt || at;
    else s.endedAt = at;
  }
  run.steps = steps;
  list[list.findIndex((r) => r.id === run.id)] = run;
  return list.slice(0, KEEP_RUNS);
}

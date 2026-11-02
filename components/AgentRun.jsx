import { useEffect, useRef, useState } from 'react';
import { RUN_STEPS, RUN_TITLE, isOpen, runState, stepsFor } from './runs';

const STARTED = 'jhhq:agent-started';

/** Starts the agent (body as /api/agent/run takes it) and tells the page, so
 *  the run shows up at once instead of at the next poll. */
export async function startAgent(body) {
  const res = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Couldn't start the agent (${res.status})`);
  window.dispatchEvent(new CustomEvent(STARTED, { detail: out.run }));
  return out;
}

const FAST_MS = 4000;
const SLOW_MS = 60000;

/** Recent runs, newest first, kept fresh: every few seconds while one is live,
 *  once a minute otherwise, and not at all while the tab is hidden.
 *  `onFinished(run)` fires when a run this page watched comes to an end. */
export function useAgentRuns(onFinished) {
  const [runs, setRuns] = useState([]);
  const live = useRef(new Set());
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    let timer = null;
    let stopped = false;

    function take(next) {
      for (const r of next) {
        if (isOpen(r)) live.current.add(r.id);
        else if (live.current.delete(r.id) && (r.status === 'done' || r.status === 'failed')) finished.current?.(r);
      }
      setRuns(next);
      return next;
    }

    async function poll() {
      clearTimeout(timer);
      let next = null;
      if (!document.hidden) {
        try {
          const res = await fetch('/api/agent/progress', { cache: 'no-store' });
          if (res.ok) next = take((await res.json()).runs || []);
        } catch {
          /* offline for a moment: try again at the next tick */
        }
      }
      if (!stopped) timer = setTimeout(poll, next && isOpen(next[0]) ? FAST_MS : SLOW_MS);
    }

    function onStarted(e) {
      if (e.detail) setRuns((prev) => [e.detail, ...prev.filter((r) => r.id !== e.detail.id)]);
      if (e.detail) live.current.add(e.detail.id);
      poll();
    }
    const onVisible = () => !document.hidden && poll();

    poll();
    window.addEventListener(STARTED, onStarted);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(STARTED, onStarted);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return runs;
}

/* A clock that ticks while a run is live, so "6 min so far" keeps moving. */
function useNow(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function span(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function day(iso) {
  const d = new Date(iso);
  const same = d.toDateString() === new Date().toDateString();
  return same ? `Today, ${clock(iso)}` : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${clock(iso)}`;
}

const STATE = {
  starting: ['Starting', 'live'],
  running: ['Running', 'live'],
  quiet: ['No news lately', 'warn'],
  noshow: ['Not reporting', 'warn'],
  lost: ['Stopped reporting', 'warn'],
  done: ['Finished', 'ok'],
  failed: ['Failed', 'bad'],
};

const STEP_TEXT = { done: 'Done', running: 'In progress', skipped: 'Skipped', failed: 'Failed', pending: 'Not started' };

function Chain({ run, now }) {
  const steps = stepsFor(run);
  const ended = run.status === 'done' || run.status === 'failed';
  return (
    <ol className="chain">
      {steps.map((s) => {
        const status = ended && s.status === 'pending' ? 'missed' : s.status;
        const took = s.startedAt && s.endedAt ? Date.parse(s.endedAt) - Date.parse(s.startedAt) : 0;
        const time =
          status === 'running'
            ? `${span(now - Date.parse(s.startedAt))} so far`
            : status === 'missed'
              ? 'Not reached'
              : status === 'skipped'
                ? 'Skipped'
                : took >= 1000
                  ? span(took)
                  : '';
        return (
          <li key={s.key} className={`chain-step ${status}`}>
            <span className="chain-dot" aria-hidden="true" />
            <div className="chain-body">
              <p className="chain-label">
                {s.label}
                <span className="sr-only"> — {status === 'missed' ? 'Not reached' : STEP_TEXT[s.status]}</span>
              </p>
              {s.detail ? <p className="chain-detail">{s.detail}</p> : null}
            </div>
            <span className="chain-time">{time}</span>
          </li>
        );
      })}
    </ol>
  );
}

function stateNote(state, run, now) {
  const idle = span(now - Date.parse(run.updatedAt));
  switch (state) {
    case 'starting':
      return 'The agent usually checks in within a minute.';
    case 'quiet':
      return `No update for ${idle}. A long search can take a while; if it stays quiet, open the Claude session.`;
    case 'noshow':
      return "The agent hasn't reported anything. It may still be working: open the Claude session to see. If runs never show their steps here, the routine's prompt is missing its PROGRESS section.";
    case 'lost':
      return `The last update was ${idle} ago and the run never said it finished. Open the Claude session to see what happened.`;
    default:
      return '';
  }
}

/** One run in full: what it is, how far it's got, and every step. */
function RunCard({ run }) {
  const live = isOpen(run);
  const now = useNow(live);
  const state = runState(run, now);
  const [word, tone] = STATE[state];
  const steps = stepsFor(run);
  const total = (RUN_STEPS[run.kind] || []).length || steps.length;
  const through = steps.filter((s) => ['done', 'skipped', 'failed'].includes(s.status)).length;
  const note = stateNote(state, run, now);
  const elapsed = span((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt));

  return (
    <div className="run-card">
      <div className="run-head">
        <div>
          <h3>
            {RUN_TITLE[run.kind] || 'Agent run'}
            {run.label ? <span className="run-label">: {run.label}</span> : null}
          </h3>
          <p className="muted small">
            {run.trigger === 'button' ? 'Started from the site' : 'Scheduled'} at {clock(run.startedAt)}.{' '}
            {run.finishedAt ? `Took ${elapsed}.` : `${elapsed} so far.`}
          </p>
        </div>
        <span className={`run-state ${tone}`}>{word}</span>
      </div>

      <div className="run-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={through} aria-label="Steps finished">
        <span style={{ width: `${total ? Math.round((through / total) * 100) : 0}%` }} />
      </div>
      <p className="small run-count">
        {through} of {total} steps finished
        {run.sessionUrl ? (
          <>
            {' · '}
            <a href={run.sessionUrl} target="_blank" rel="noopener noreferrer">
              Open the Claude session ↗
            </a>
          </>
        ) : null}
      </p>

      {note ? <p className={`run-note ${tone}`}>{note}</p> : null}
      {run.summary ? <p className={`run-summary ${tone}`}>{run.summary}</p> : null}

      <Chain run={run} now={now} />
    </div>
  );
}

/* A finished run stays open on the page this long, then folds into a row. */
const SHOW_DONE_MS = 30 * 60 * 1000;

/** One run as a row that opens to its full card. */
function RunRow({ run }) {
  const [word, tone] = STATE[runState(run)];
  return (
    <details className="run-row">
      <summary>
        <span>
          {RUN_TITLE[run.kind] || 'Agent run'}
          {run.label ? `: ${run.label}` : ''}
        </span>
        <span className="muted small">{day(run.startedAt)}</span>
        <span className={`run-state ${tone}`}>{word}</span>
      </summary>
      <RunCard run={run} />
    </details>
  );
}

/** The latest run in full while it's live or just finished; older runs, and
 *  the latest once it's been done a while, fold into rows. */
export function AgentRuns({ runs }) {
  if (!runs.length) return null;
  const [latest, ...earlier] = runs;
  const recent = isOpen(latest) || Date.now() - Date.parse(latest.updatedAt) < SHOW_DONE_MS;
  return (
    <section className="agent-runs" aria-labelledby="runs-h">
      <h2 id="runs-h" className="sr-only">
        Agent runs
      </h2>
      {recent ? <RunCard run={latest} /> : null}
      {!recent ? (
        <div className="run-history">
          <p className="run-history-h">Last agent run</p>
          <RunRow run={latest} />
        </div>
      ) : null}
      {earlier.length ? (
        <details className="run-history">
          <summary>Earlier runs ({earlier.length})</summary>
          <ul>
            {earlier.map((r) => (
              <li key={r.id}>
                <RunRow run={r} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** A small "Agent running" marker for the sidebar and the phone top bar. */
export function AgentPill({ run, onOpen }) {
  const now = useNow(isOpen(run));
  if (!run || !isOpen(run, now)) return null;
  const steps = stepsFor(run);
  const current = steps.find((s) => s.status === 'running');
  const total = (RUN_STEPS[run.kind] || []).length || steps.length;
  const through = steps.filter((s) => ['done', 'skipped', 'failed'].includes(s.status)).length;
  return (
    <button className="agent-pill" onClick={onOpen} title="See what the agent is doing">
      <span className="agent-pulse" aria-hidden="true" />
      <span className="agent-pill-text">
        {current ? current.label : run.status === 'starting' ? 'Agent starting' : 'Agent running'}
        <small>
          {' '}
          {through}/{total}
        </small>
      </span>
    </button>
  );
}

/** One line on Today: what the agent is doing now, or how today's run went. */
export function AgentLine({ runs, openBrief }) {
  const run = runs[0];
  const now = useNow(isOpen(run));
  if (!run) return null;
  const live = isOpen(run, now);
  const ranToday = new Date(run.startedAt).toDateString() === new Date(now).toDateString();
  if (!live && !ranToday) return null;

  const state = runState(run, now);
  const [, tone] = STATE[state];
  const steps = stepsFor(run);
  const total = (RUN_STEPS[run.kind] || []).length || steps.length;
  const through = steps.filter((s) => ['done', 'skipped', 'failed'].includes(s.status)).length;
  const current = steps.find((s) => s.status === 'running');
  const title = `${RUN_TITLE[run.kind] || 'Agent run'}${run.label ? `: ${run.label}` : ''}`;

  let head;
  let body = '';
  if (live && state !== 'noshow') {
    head = current ? `Agent is on step ${through + 1} of ${total}: ${current.label}` : `${title} starting`;
    body = current?.detail || '';
  } else if (state === 'done') {
    head = `${title} finished at ${clock(run.finishedAt)}`;
    body = run.summary;
  } else if (state === 'failed') {
    head = `${title} failed at ${clock(run.finishedAt)}`;
    body = run.summary;
  } else {
    head = `${title} isn't reporting`;
    body = stateNote(state, run, now);
  }

  return (
    <section className={`agent-line ${tone}`} aria-live="polite">
      {live ? <span className="agent-pulse" aria-hidden="true" /> : null}
      <div className="agent-line-text">
        <p className="agent-line-head">{head}</p>
        {body ? <p className="agent-line-body">{body}</p> : null}
      </div>
      <button className="ghost" onClick={openBrief}>
        {live ? 'Watch' : 'See steps'}
      </button>
    </section>
  );
}

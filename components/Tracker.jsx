'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const STATUSES = [
  ['wishlist', 'Wishlist'],
  ['outreach', 'Outreach sent'],
  ['applied', 'Applied'],
  ['interviewing', 'Interviewing'],
  ['offer', 'Offer'],
  ['rejected', 'Rejected'],
  ['dropped', 'Dropped'],
];
const LABEL = Object.fromEntries(STATUSES);
const CLOSED = new Set(['offer', 'rejected', 'dropped']);
const BOARD_COLUMNS = ['wishlist', 'outreach', 'applied', 'interviewing', 'offer'];

/* The date an offer should be in hand by, to join in January. */
const OFFER_BY = '2026-11-15';

const FIELDS = [
  ['company', 'Company', 'text'],
  ['role', 'Role', 'text'],
  ['jobId', 'Job / req ID', 'text'],
  ['status', 'Status', 'status'],
  ['fit', 'Fit (1–5)', 'number'],
  ['source', 'Source', 'text'],
  ['url', 'Job link', 'text'],
  ['contact', 'Contact', 'text'],
  ['contactUrl', 'Contact link', 'text'],
  ['postedOn', 'Posted on', 'date'],
  ['messagedOn', 'Messaged on', 'date'],
  ['followUpOn', 'Follow up on', 'date'],
  ['deadline', 'Deadline', 'date'],
  ['interviewAt', 'Interview at', 'datetime-local'],
];

/* Outreach pace the pace card and the insights hold you to. */
const WEEKLY_TARGET = 12;
const DAILY_TARGET = 3;
const FOLLOW_UP_DAYS = 5;
const SNOOZE_DAYS = 3;
/* A wishlist row untouched this long asks for a decision. */
const DECIDE_AFTER = 10;
const QUEUE_SIZE = 5;

/** YYYY-MM-DD in the viewer's own timezone, so "today" flips at local midnight. */
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());
function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtWhen(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function daysAgo(v) {
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** A row needs action when a deadline, interview or follow-up has come due. */
function dueReason(j) {
  if (CLOSED.has(j.status)) return null;
  if (j.deadline && j.deadline <= plusDays(1)) return 'deadline';
  if (j.interviewAt && j.interviewAt.slice(0, 10) <= plusDays(1)) return 'interview';
  if (j.followUpOn && j.followUpOn <= today()) return 'follow-up';
  return null;
}
/** A wishlist row nobody has touched in three weeks. */
function isStale(j) {
  return j.status === 'wishlist' && !j.messagedOn && (daysAgo(j.addedOn) ?? 0) > 21;
}

/** Drop is one click from the queue, so check first. */
function confirmDrop(j) {
  return window.confirm(
    `Drop ${j.company}${j.role ? ` – ${j.role}` : ''}?\n\nIt leaves Today and your open list. You can undo right after, or set the status back later.`
  );
}

const isSnoozed = (j) => Boolean(j.snoozedUntil && j.snoozedUntil > today());
/** The deadline has already gone by: nothing to do today, only a decision. */
const deadlinePassed = (j) => !CLOSED.has(j.status) && Boolean(j.deadline && j.deadline < today());

/** The fields "Mark sent" sets, shared by the queue and the detail editor. */
function markSentPatch(j) {
  return {
    messagedOn: today(),
    followUpOn: plusDays(FOLLOW_UP_DAYS),
    status: j.status === 'wishlist' ? 'outreach' : j.status,
    pinnedOn: '',
  };
}

/** What to do today, most urgent first: anything due, roles you pinned, then
 *  the best-fit roles that have a draft written but no message sent. */
function buildQueue(jobs) {
  const items = [];
  for (const j of jobs) {
    if (CLOSED.has(j.status)) continue;
    const due = dueReason(j);
    if (due === 'deadline' && deadlinePassed(j)) continue;
    if (due) items.push({ j, kind: due, rank: 0 });
    else if (isSnoozed(j)) continue;
    else if (j.pinnedOn && !j.messagedOn) items.push({ j, kind: 'pinned', rank: 1 });
    else if (j.status === 'wishlist' && !j.messagedOn && j.draft && (j.fit || 0) >= 4)
      items.push({ j, kind: 'send', rank: 2 });
  }
  return items.sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.j.fit || 0) - (a.j.fit || 0) ||
      String(b.j.postedOn || '').localeCompare(String(a.j.postedOn || ''))
  );
}

/** Rows that need "do it or drop it": a lapsed deadline, or a wishlist row
 *  that has sat untouched too long. */
function needsDecision(j) {
  if (deadlinePassed(j)) return true;
  return (
    j.status === 'wishlist' &&
    !j.messagedOn &&
    !j.pinnedOn &&
    !isSnoozed(j) &&
    (daysAgo(j.addedOn) ?? 0) >= DECIDE_AFTER
  );
}

/** One entry per job per day it moved forward: a message sent or an application. */
function dailyActivity(jobs, events) {
  const sent = new Set();
  const applied = new Set();
  for (const j of jobs) if (j.messagedOn) sent.add(`${j.id}|${j.messagedOn}`);
  for (const e of events) {
    if (e.field === 'messagedOn' && e.new_val) sent.add(`${e.job_id}|${e.new_val.slice(0, 10)}`);
    if (e.field === 'status' && e.new_val === 'applied') applied.add(`${e.job_id}|${iso(new Date(e.at))}`);
  }
  const days = {};
  const bump = (key, kind) => {
    const day = key.split('|')[1];
    days[day] ??= { sent: 0, applied: 0 };
    days[day][kind] += 1;
  };
  sent.forEach((k) => bump(k, 'sent'));
  applied.forEach((k) => bump(k, 'applied'));
  return days;
}

export default function Tracker({ initialJobs, initialBrief, events = [], readOnly, loadError, agentReady }) {
  const [jobs, setJobs] = useState(initialJobs || []);
  const [brief] = useState(initialBrief || {});
  const [view, setView] = useState('board');
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [minFit, setMinFit] = useState(0);
  const [sort, setSort] = useState('priority');
  const [openId, setOpenId] = useState(null);
  const [theme, setTheme] = useState(null);
  const [toast, setToast] = useState(null);
  /* The queue and insights depend on the viewer's local date, which the server
     can't know, so they render after hydration. */
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => setMounted(true), []);

  function showToast(next) {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }

  /** Apply a one-click change, with an Undo that restores the old values. */
  async function act(j, patch, label) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, j[k] ?? '']));
    try {
      await save(j.id, patch);
      showToast({
        text: label,
        undo: async () => {
          setToast(null);
          try {
            await save(j.id, before);
          } catch (e) {
            showToast({ text: e.message, error: true });
          }
        },
      });
    } catch (e) {
      showToast({ text: e.message, error: true });
    }
  }

  function openRow(id) {
    setFilter('all');
    setQuery('');
    setMinFit(0);
    setView('table');
    setOpenId(id);
    requestAnimationFrame(() =>
      document.querySelector('.tablebox tr.row.open')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  }

  /* Theme toggle, remembered per browser. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('jhhq_theme');
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {
      /* private window or blocked storage — stay on the system theme */
    }
  }, []);
  function toggleTheme() {
    const isDark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('jhhq_theme', next);
    } catch {
      /* ignore */
    }
  }

  /* "/" focuses search. */
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setOpenId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = useMemo(() => {
    const c = {
      all: jobs.length,
      open: jobs.filter((j) => !CLOSED.has(j.status)).length,
      due: jobs.filter((j) => dueReason(j)).length,
      stale: jobs.filter(isStale).length,
    };
    for (const [k] of STATUSES) c[k] = jobs.filter((j) => j.status === k).length;
    return c;
  }, [jobs]);

  const funnel = useMemo(() => {
    const sent = jobs.filter((j) => j.messagedOn).length;
    const applied = jobs.filter((j) => ['applied', 'interviewing', 'offer'].includes(j.status)).length;
    const live = counts.interviewing + counts.offer;
    const daysLeft = Math.max(0, Math.ceil((new Date(`${OFFER_BY}T00:00:00+05:30`) - Date.now()) / 86400000));
    const weeksLeft = Math.max(1, Math.round(daysLeft / 7));
    return { sent, applied, live, daysLeft, weeksLeft };
  }, [jobs, counts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = jobs.filter((j) => {
      if (filter === 'due' && !dueReason(j)) return false;
      if (filter === 'stale' && !isStale(j)) return false;
      if (filter === 'open' && CLOSED.has(j.status)) return false;
      if (!['all', 'due', 'stale', 'open'].includes(filter) && j.status !== filter) return false;
      if (minFit && (j.fit || 0) < minFit) return false;
      if (q) {
        const hay = `${j.company} ${j.role} ${j.contact} ${j.source} ${j.jobId} ${j.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byCompany = (a, b) => String(a.company).localeCompare(String(b.company));
    if (sort === 'company') list = [...list].sort(byCompany);
    else if (sort === 'fit') list = [...list].sort((a, b) => (b.fit || 0) - (a.fit || 0) || byCompany(a, b));
    else if (sort === 'added') list = [...list].sort((a, b) => String(b.addedOn).localeCompare(String(a.addedOn)));
    else
      list = [...list].sort(
        (a, b) =>
          Boolean(dueReason(b)) - Boolean(dueReason(a)) ||
          (b.fit || 0) - (a.fit || 0) ||
          byCompany(a, b)
      );
    return list;
  }, [jobs, filter, query, minFit, sort]);

  function applySaved(saved) {
    setJobs((prev) => prev.map((j) => (j.id === saved.id ? { ...j, ...saved } : j)));
  }

  async function save(id, patch) {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
    applySaved(body.saved);
    return body.saved;
  }

  async function addRow() {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company: 'New company', role: '', status: 'wishlist', fit: 3, source: 'Manual' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error || 'Could not add a row.');
      return;
    }
    const saved = body.saved?.[0];
    if (saved) {
      setJobs((prev) => [...prev, saved]);
      setFilter('all');
      setView('table');
      setOpenId(saved.id);
    }
  }

  const pills = [
    ['open', 'Open'],
    ['due', 'Needs action'],
    ['stale', 'Stale'],
    ['all', 'All'],
    ...STATUSES.filter(([k]) => counts[k] > 0),
  ];

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Job Hunt HQ</h1>
          <p className="sub">
            Backend + AI / FDE roles · Hyderabad &amp; remote India · offer by 15 Nov, join by Jan 2027
          </p>
        </div>
        <div className="head-right">
          <button className="ghost" onClick={toggleTheme} aria-label="Switch colour theme">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <div className={`countdown${funnel.daysLeft <= 21 ? ' tight' : ''}`}>
            <b>{funnel.daysLeft} days</b>
            to offer-in-hand (15 Nov)
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="banner bad">
          Couldn&apos;t reach Supabase: {loadError}. Check <code>SUPABASE_URL</code> and{' '}
          <code>SUPABASE_SECRET_KEY</code> in your Vercel project settings, and that the migration has
          been pushed.
        </div>
      ) : null}

      {readOnly ? (
        <div className="banner warn">
          Read-only: no database is connected, so this is the snapshot bundled with the deploy. Connect
          Supabase (<code>SUPABASE_URL</code> and <code>SUPABASE_SECRET_KEY</code>), then POST to{' '}
          <code>/api/seed</code> to import these {jobs.length} rows and turn on editing.
        </div>
      ) : null}

      {mounted ? (
        <>
          <TodayQueue jobs={jobs} act={act} openRow={openRow} readOnly={readOnly} />
          <DecideCard jobs={jobs} act={act} readOnly={readOnly} />
          <Insights jobs={jobs} events={events} counts={counts} />
        </>
      ) : null}

      <PaceCard funnel={funnel} counts={counts} />

      <section className="card" aria-labelledby="brief-h">
        <div className="card-head">
          <h2 id="brief-h">Today&apos;s brief</h2>
          <div className="brief-head-right">
            <span className="eyebrow">
              {brief.date ? `Updated ${fmtDate(brief.date)}` : 'No brief yet'}
            </span>
            <RunAgent ready={agentReady} />
          </div>
        </div>
        <div className="brief-grid">
          <div className="bcell">
            <span className="eyebrow">Naukri headline</span>
            <CopyBox text={brief.naukri} />
          </div>
          <div className="bcell">
            <span className="eyebrow">Do today</span>
            <ul>
              {(brief.todo?.length ? brief.todo : ['The morning agent fills this in each weekday at 8:30.']).map(
                (t, i) => (
                  <li key={i}>{t}</li>
                )
              )}
            </ul>
          </div>
          <div className="bcell">
            <span className="eyebrow">From your inbox</span>
            <ul>
              {(brief.inbox?.length ? brief.inbox : ['Recruiter mail and application updates land here.']).map(
                (t, i) => (
                  <li key={i}>{t}</li>
                )
              )}
            </ul>
          </div>
          <div className="bcell">
            <span className="eyebrow">Market notes</span>
            <p className="notes-body">{brief.notes || '—'}</p>
          </div>
        </div>
      </section>

      <div className="stats" role="group" aria-label="Filter rows">
        {pills.map(([k, label]) => (
          <button
            key={k}
            className={`stat${(k === 'due' || k === 'stale') && counts[k] ? ' alert' : ''}`}
            data-f={k}
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
          >
            <b>{counts[k]}</b>
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input
            id="q"
            ref={searchRef}
            type="search"
            placeholder="Search company, role, contact…  (/)"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Minimum fit"
            value={minFit}
            onChange={(e) => setMinFit(Number(e.target.value))}
          >
            <option value={0}>Any fit</option>
            <option value={4}>Fit 4+</option>
            <option value={5}>Fit 5 only</option>
          </select>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="priority">Sort: priority</option>
            <option value="fit">Sort: fit</option>
            <option value="company">Sort: company</option>
            <option value="added">Sort: newest</option>
          </select>
        </div>
        <div className="toolbar-left" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
          <div className="seg">
            <button aria-pressed={view === 'board'} onClick={() => setView('board')}>
              Board
            </button>
            <button aria-pressed={view === 'table'} onClick={() => setView('table')}>
              Table
            </button>
          </div>
          <button className="primary" onClick={addRow} disabled={readOnly}>
            Add a role
          </button>
        </div>
      </div>

      {view === 'board' ? (
        <Board rows={visible} onOpen={(id) => { setOpenId(id); setView('table'); }} />
      ) : (
        <TableView
          rows={visible}
          total={jobs.length}
          openId={openId}
          setOpenId={setOpenId}
          save={save}
          readOnly={readOnly}
          onDelete={(id) => setJobs((prev) => prev.filter((j) => j.id !== id))}
        />
      )}

      {events.length ? <Activity events={events} /> : null}

      {toast ? (
        <div className={`toast${toast.error ? ' err' : ''}`} role="status">
          <span>{toast.text}</span>
          {toast.undo ? (
            <button className="ghost" onClick={toast.undo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

/* ---------------- today ---------------- */

function Fit({ n }) {
  return (
    <span className="fit" title={`Fit ${n || 0}/5`}>
      {'●'.repeat(n || 0)}
      {'○'.repeat(Math.max(0, 5 - (n || 0)))}
    </span>
  );
}

function queueReason({ j, kind }) {
  if (kind === 'deadline') return `Deadline ${fmtDate(j.deadline)}`;
  if (kind === 'interview') return `Interview ${fmtWhen(j.interviewAt)}`;
  if (kind === 'follow-up') return `Follow-up due · messaged ${fmtDate(j.messagedOn)}`;
  if (kind === 'pinned') return 'You picked this to do now';
  const age = daysAgo(j.addedOn);
  return `Draft ready${age != null ? ` · ${age}d on your list` : ''}`;
}

function TodayQueue({ jobs, act, openRow, readOnly }) {
  const queue = useMemo(() => buildQueue(jobs), [jobs]);
  const sentToday = jobs.filter((j) => j.messagedOn === today()).length;
  const shown = queue.slice(0, QUEUE_SIZE);

  return (
    <section className="card today" aria-labelledby="today-h">
      <div className="card-head">
        <h2 id="today-h">Today</h2>
        <span className={`eyebrow${sentToday >= DAILY_TARGET ? ' done' : ''}`}>
          {sentToday} of {DAILY_TARGET} sent today
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="muted">
          Nothing queued. Anything with a deadline, interview, follow-up or a fit-4+ draft shows up here.
        </p>
      ) : (
        <div className="queue">
          {shown.map((item) => (
            <QueueCard key={item.j.id} item={item} act={act} openRow={openRow} readOnly={readOnly} />
          ))}
        </div>
      )}
      {queue.length > shown.length ? (
        <p className="muted small">
          {queue.length - shown.length} more after these. Clear one and the next moves up.
        </p>
      ) : null}
    </section>
  );
}

function QueueCard({ item, act, openRow, readOnly }) {
  const { j, kind } = item;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const urgent = kind === 'deadline' || kind === 'interview';
  const sendable = kind === 'send' || kind === 'pinned';

  async function run(patch, label) {
    setBusy(true);
    await act(j, patch, label);
    setBusy(false);
  }

  return (
    <article className={`qcard${urgent ? ' urgent' : ''}`}>
      <div className="qhead">
        <div>
          <div className="co">{j.company}</div>
          <div className="role">{j.role || 'Role to pick'}</div>
        </div>
        <Fit n={j.fit} />
      </div>
      <span className={`qreason${urgent || kind === 'follow-up' ? ' late' : ''}`}>{queueReason(item)}</span>
      {j.draft && !urgent ? <p className="qdraft">{j.draft}</p> : null}
      <div className="qactions">
        {sendable ? (
          <button
            className="primary"
            disabled={busy || readOnly}
            onClick={() => run(markSentPatch(j), `Sent to ${j.company} · follow-up in ${FOLLOW_UP_DAYS} days`)}
          >
            Mark sent
          </button>
        ) : kind === 'follow-up' ? (
          <button
            className="primary"
            disabled={busy || readOnly}
            onClick={() =>
              run({ followUpOn: plusDays(FOLLOW_UP_DAYS) }, `Followed up with ${j.company} · next in ${FOLLOW_UP_DAYS} days`)
            }
          >
            Followed up
          </button>
        ) : (
          <button className="primary" onClick={() => openRow(j.id)}>
            Open details
          </button>
        )}
        {j.draft && !urgent ? (
          <button
            className="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(j.draft);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                openRow(j.id);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy draft'}
          </button>
        ) : null}
        {j.url ? (
          <a className="qlink" href={j.url} target="_blank" rel="noopener noreferrer">
            Job ↗
          </a>
        ) : null}
        {j.contactUrl ? (
          <a className="qlink" href={j.contactUrl} target="_blank" rel="noopener noreferrer">
            Contact ↗
          </a>
        ) : null}
        <span className="qmore">
        {kind !== 'interview' && kind !== 'deadline' ? (
          <button
            className="ghost"
            disabled={busy || readOnly}
            onClick={() =>
              run(
                kind === 'follow-up' ? { followUpOn: plusDays(SNOOZE_DAYS) } : { snoozedUntil: plusDays(SNOOZE_DAYS) },
                `${j.company} snoozed ${SNOOZE_DAYS} days`
              )
            }
          >
            Snooze {SNOOZE_DAYS}d
          </button>
        ) : null}
        {kind !== 'interview' ? (
          <button
            className="ghost danger"
            disabled={busy || readOnly}
            onClick={() => confirmDrop(j) && run({ status: 'dropped' }, `Dropped ${j.company}`)}
          >
            Drop
          </button>
        ) : null}
        </span>
      </div>
    </article>
  );
}

/* ---------------- decide or drop ---------------- */

function DecideCard({ jobs, act, readOnly }) {
  const [showAll, setShowAll] = useState(false);
  const inQueue = useMemo(
    () => new Set(buildQueue(jobs).slice(0, QUEUE_SIZE).map(({ j }) => j.id)),
    [jobs]
  );
  const rows = useMemo(
    () =>
      jobs
        .filter((j) => needsDecision(j) && !inQueue.has(j.id))
        .sort(
          (a, b) =>
            deadlinePassed(b) - deadlinePassed(a) ||
            String(a.addedOn || '').localeCompare(String(b.addedOn || ''))
        ),
    [jobs, inQueue]
  );
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, 5);

  return (
    <section className="card" aria-labelledby="decide-h">
      <div className="card-head">
        <h2 id="decide-h">Decide or drop</h2>
        <span className="eyebrow">
          {rows.length} role{rows.length === 1 ? '' : 's'} past a deadline or {DECIDE_AFTER}+ days with nothing sent
        </span>
      </div>
      <div className="decide">
        {shown.map((j) => (
          <div className="drow" key={j.id}>
            <div className="dwho">
              <span className="co">{j.company}</span>
              <span className="role">{j.role || 'Role to pick'}</span>
            </div>
            <Fit n={j.fit} />
            {deadlinePassed(j) ? (
              <span className="mono late">Deadline {fmtDate(j.deadline)} passed</span>
            ) : (
              <span className="mono">{daysAgo(j.addedOn)}d</span>
            )}
            <div className="dbtns">
              {deadlinePassed(j) ? (
                <button
                  className="ghost"
                  disabled={readOnly}
                  onClick={() => act(j, { deadline: '' }, `Cleared the ${j.company} deadline`)}
                >
                  Clear deadline
                </button>
              ) : (
                <>
                  <button
                    className="ghost"
                    disabled={readOnly}
                    onClick={() => act(j, { pinnedOn: today() }, `${j.company} moved into Today`)}
                  >
                    Do now
                  </button>
                  <button
                    className="ghost"
                    disabled={readOnly}
                    onClick={() =>
                      act(j, { snoozedUntil: plusDays(SNOOZE_DAYS) }, `${j.company} snoozed ${SNOOZE_DAYS} days`)
                    }
                  >
                    Snooze {SNOOZE_DAYS}d
                  </button>
                </>
              )}
              <button
                className="ghost danger"
                disabled={readOnly}
                onClick={() => confirmDrop(j) && act(j, { status: 'dropped' }, `Dropped ${j.company}`)}
              >
                Drop
              </button>
            </div>
          </div>
        ))}
      </div>
      {rows.length > 5 ? (
        <button className="ghost" style={{ justifySelf: 'start' }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      ) : null}
    </section>
  );
}

/* ---------------- insights ---------------- */

const CHART_DAYS = 14;

function Insights({ jobs, events, counts }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const days = useMemo(() => dailyActivity(jobs, events), [jobs, events]);

  const series = [];
  for (let i = CHART_DAYS - 1; i >= 0; i -= 1) {
    const day = plusDays(-i);
    series.push({ day, sent: days[day]?.sent || 0, applied: days[day]?.applied || 0 });
  }
  const yMax = Math.max(DAILY_TARGET + 1, ...series.map((d) => d.sent + d.applied));

  /* Week runs Monday to Sunday. */
  const dow = (new Date().getDay() + 6) % 7;
  let week = 0;
  for (let i = 0; i <= dow; i += 1) week += days[plusDays(-i)]?.sent || 0;

  /* Consecutive days with any progress, counting today only once it has some. */
  let streak = 0;
  for (let i = days[today()] ? 0 : 1; ; i += 1) {
    const d = days[plusDays(-i)];
    if (!d || d.sent + d.applied === 0) break;
    streak += 1;
  }

  const ADVANCED = new Set(['outreach', 'applied', 'interviewing', 'offer', 'rejected']);
  const contacted = jobs.filter((j) => j.messagedOn || ADVANCED.has(j.status)).length;
  const applied = jobs.filter((j) => ['applied', 'interviewing', 'offer', 'rejected'].includes(j.status)).length;
  const interviewing = counts.interviewing + counts.offer;
  const stages = [
    ['Tracked', jobs.length],
    ['Contacted', contacted],
    ['Applied', applied],
    ['Interviewing', interviewing],
    ['Offer', counts.offer],
  ];
  /* Only steps with enough rows behind them to mean something. */
  let worst = null;
  for (let i = 1; i < stages.length; i += 1) {
    const [prevLabel, prev] = stages[i - 1];
    if (prev < 5) continue;
    const rate = stages[i][1] / prev;
    if (!worst || rate < worst.rate) worst = { from: prevLabel, to: stages[i][0], rate };
  }
  const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

  const focus = hover != null ? series[hover] : null;

  return (
    <section className="card" aria-labelledby="insights-h">
      <div className="card-head">
        <h2 id="insights-h">Insights</h2>
        <span className="eyebrow">Last {CHART_DAYS} days</span>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="eyebrow">This week</span>
          <b>
            {week}
            <small> / {WEEKLY_TARGET} sent</small>
          </b>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (week / WEEKLY_TARGET) * 100)}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span className="eyebrow">Streak</span>
          <b>
            {streak}
            <small> day{streak === 1 ? '' : 's'}</small>
          </b>
          <span className="muted small">{streak ? 'Keep it going today.' : 'Send one to start it.'}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Contacted → interview</span>
          <b>{contacted >= 5 ? pct(interviewing, contacted) : '—'}</b>
          <span className="muted small">
            {contacted >= 5 ? `${interviewing} of ${contacted} contacted` : `Shows after 5 contacted (now ${contacted})`}
          </span>
        </div>
      </div>

      <div className="chart-block">
        <div className="chart-top">
          <div className="legend">
            <span><i className="sw s1" />Outreach sent</span>
            <span><i className="sw s2" />Applied</span>
          </div>
          <button className="ghost" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Chart' : 'Table'}
          </button>
        </div>
        <p className="readout mono" aria-live="polite">
          {focus
            ? `${fmtDate(focus.day)} · ${focus.sent} sent · ${focus.applied} applied`
            : `${series.reduce((n, d) => n + d.sent, 0)} sent · ${series.reduce((n, d) => n + d.applied, 0)} applied in ${CHART_DAYS} days`}
        </p>
        {asTable ? (
          <table className="mini">
            <thead>
              <tr>
                <th>Day</th>
                <th>Sent</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{fmtDate(d.day)}</td>
                  <td>{d.sent}</td>
                  <td>{d.applied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="bars" onMouseLeave={() => setHover(null)}>
            <div className="target" style={{ bottom: `${(DAILY_TARGET / yMax) * 100}%` }}>
              <span>target {DAILY_TARGET}/day</span>
            </div>
            {series.map((d, i) => (
              <button
                key={d.day}
                className={`bar${hover === i ? ' on' : ''}`}
                aria-label={`${fmtDate(d.day)}: ${d.sent} sent, ${d.applied} applied`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <span className="stack">
                  {d.applied ? <span className="seg2" style={{ height: `${(d.applied / yMax) * 100}%` }} /> : null}
                  {d.sent ? <span className="seg1" style={{ height: `${(d.sent / yMax) * 100}%` }} /> : null}
                </span>
                <span className="tick">{i % 2 === (CHART_DAYS - 1) % 2 ? fmtDate(d.day) : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="funnel">
        <span className="eyebrow">Funnel</span>
        {stages.map(([label, n], i) => (
          <div className="frow" key={label}>
            <span className="flabel">{label}</span>
            <span className="ftrack">
              <span className="fbar" style={{ width: `${jobs.length ? Math.max(n ? 1.5 : 0, (n / jobs.length) * 100) : 0}%` }} />
            </span>
            <span className="fnum mono">
              {n}
              {i > 0 ? <span className="muted"> · {pct(n, stages[i - 1][1])}</span> : null}
            </span>
          </div>
        ))}
        {worst ? (
          <p className="muted small">
            Biggest drop: <strong>{worst.from} → {worst.to}</strong> ({pct(worst.rate, 1)}). That&apos;s the step to
            work on.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* ---------------- pace ---------------- */

function PaceCard({ funnel, counts }) {
  const needPerWeek = WEEKLY_TARGET;
  const behind = funnel.live < 2 && funnel.daysLeft < 45;
  const verdict = behind
    ? `Behind. ${funnel.live} live interview loop${funnel.live === 1 ? '' : 's'} with ${funnel.daysLeft} days to go — you need 2+ by mid-October to have an offer by 15 Nov.`
    : `${funnel.live} live loop${funnel.live === 1 ? '' : 's'}, ${funnel.weeksLeft} weeks left. Keep ${needPerWeek} outreach messages a week going.`;

  return (
    <section className={`banner ${behind ? 'bad' : 'warn'}`} aria-label="Pace check">
      <strong>Pace:</strong> {verdict} Tracked: {counts.all} roles, {funnel.sent} contacted,{' '}
      {funnel.applied} applied, {counts.interviewing} interviewing, {counts.offer} offer
      {counts.offer === 1 ? '' : 's'}.
    </section>
  );
}

/** Starts the morning agent now instead of waiting for its 8:30 weekday run. */
function RunAgent({ ready }) {
  const [state, setState] = useState({ busy: false, started: false, url: null, error: '' });

  async function run() {
    if (
      !window.confirm(
        'Run the job-hunt agent now?\n\nIt syncs Gmail, adds new roles, writes drafts and rewrites today\'s brief. A run takes about 10 minutes; reload the page afterwards to see the results.'
      )
    )
      return;
    setState({ busy: true, started: false, url: null, error: '' });
    try {
      const res = await fetch('/api/agent/run', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Couldn't start the agent (${res.status})`);
      setState({ busy: false, started: true, url: body.sessionUrl, error: '' });
    } catch (e) {
      setState({ busy: false, started: false, url: null, error: e.message });
    }
  }

  if (state.started) {
    return (
      <span className="agent-status">
        Agent started
        {state.url ? (
          <>
            {' · '}
            <a href={state.url} target="_blank" rel="noopener noreferrer">
              Watch the run ↗
            </a>
          </>
        ) : null}
      </span>
    );
  }
  return (
    <span className="agent-run">
      <button
        className="ghost"
        onClick={run}
        disabled={!ready || state.busy}
        title={ready ? 'Start the scheduled agent now' : 'Connect the agent first: see the README'}
      >
        {state.busy ? 'Starting…' : 'Run agent now'}
      </button>
      {state.error ? <span className="saved err">{state.error}</span> : null}
      {!ready ? <span className="muted small">Agent not connected</span> : null}
    </span>
  );
}

function CopyBox({ text }) {
  const [state, setState] = useState('');
  if (!text) return <div className="naukri">—</div>;
  return (
    <>
      <div className="naukri">{text}</div>
      <button
        className="ghost"
        style={{ justifySelf: 'start' }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState('Copied');
          } catch {
            setState('Select it and press Ctrl/Cmd+C');
          }
          setTimeout(() => setState(''), 2500);
        }}
      >
        {state || 'Copy headline'}
      </button>
    </>
  );
}

/* ---------------- board ---------------- */

function Board({ rows, onOpen }) {
  return (
    <div className="board">
      {BOARD_COLUMNS.map((status) => {
        const items = rows.filter((j) => j.status === status);
        return (
          <section className="col" key={status} aria-label={LABEL[status]}>
            <div className="col-head">
              <b>{LABEL[status]}</b>
              <span className="col-count">{items.length}</span>
            </div>
            <div className="col-body">
            {items.length === 0 ? (
              <p className="role" style={{ margin: 0 }}>
                Nothing here.
              </p>
            ) : (
              items.map((j) => {
                const due = dueReason(j);
                return (
                  <button
                    key={j.id}
                    className={`jcard f${j.fit || 3}${due ? ' due' : ''}`}
                    onClick={() => onOpen(j.id)}
                  >
                    <span className="co">{j.company}</span>
                    <span className="role">{j.role || 'Role to pick'}</span>
                    <span className="jcard-foot">
                      <span className="fit">
                        {'●'.repeat(j.fit || 0)}
                        {'○'.repeat(Math.max(0, 5 - (j.fit || 0)))}
                      </span>
                      <span className={`mono${due ? ' late' : ''}`}>
                        {due === 'deadline'
                          ? `Due ${fmtDate(j.deadline)}`
                          : due === 'interview'
                            ? `Interview ${fmtDate(j.interviewAt)}`
                            : due === 'follow-up'
                              ? 'Follow up'
                              : j.postedOn
                                ? `${daysAgo(j.postedOn)}d old`
                                : ''}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- table ---------------- */

function TableView({ rows, total, openId, setOpenId, save, readOnly, onDelete }) {
  return (
    <div className="tablebox">
      <table>
        <thead>
          <tr>
            <th>Company / role</th>
            <th>Status</th>
            <th>Fit</th>
            <th>Contact</th>
            <th>Messaged</th>
            <th>Next date</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty">
                {total ? 'Nothing matches this filter.' : 'No roles yet.'}
              </td>
            </tr>
          ) : (
            rows.map((j) => {
              const due = dueReason(j);
              const isOpen = openId === j.id;
              return (
                <Row
                  key={j.id}
                  j={j}
                  due={due}
                  isOpen={isOpen}
                  setOpenId={setOpenId}
                  save={save}
                  readOnly={readOnly}
                  onDelete={onDelete}
                />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ j, due, isOpen, setOpenId, save, readOnly, onDelete }) {
  return (
    <>
      <tr
        className={`row${isOpen ? ' open' : ''}`}
        tabIndex={0}
        onClick={() => setOpenId(isOpen ? null : j.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpenId(isOpen ? null : j.id);
          }
        }}
      >
        <td>
          <div className="co">{j.company}</div>
          <div className="role">
            {j.role || 'Role to pick'}
            {j.jobId ? <span className="mono"> · {j.jobId}</span> : null}
          </div>
        </td>
        <td>
          <span className={`chip s-${j.status}`}>{LABEL[j.status] || j.status}</span>
        </td>
        <td className="fit" title={`Fit ${j.fit || 0}/5`}>
          {'●'.repeat(j.fit || 0)}
          {'○'.repeat(Math.max(0, 5 - (j.fit || 0)))}
        </td>
        <td>{j.contact || '—'}</td>
        <td className="mono">{fmtDate(j.messagedOn)}</td>
        <td className={`mono${due ? ' late' : ''}`}>
          {due === 'deadline'
            ? `Due ${fmtDate(j.deadline)}`
            : due === 'interview'
              ? fmtDate(j.interviewAt)
              : fmtDate(j.followUpOn)}
        </td>
        <td className="role">{j.source || '—'}</td>
      </tr>
      {isOpen ? (
        <tr className="detail">
          <td colSpan={7}>
            <Detail j={j} save={save} readOnly={readOnly} onDelete={onDelete} close={() => setOpenId(null)} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Detail({ j, save, readOnly, onDelete, close }) {
  const [form, setForm] = useState(j);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(j), [j]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function flash(text, isErr = false) {
    setMsg(text);
    setErr(isErr);
    setTimeout(() => setMsg(''), 3000);
  }

  async function commit(patch, label = 'Saved') {
    setBusy(true);
    try {
      await save(j.id, patch);
      flash(label);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const patch = {};
    for (const [key] of FIELDS) patch[key] = form[key] ?? '';
    patch.fit = Math.min(5, Math.max(1, Number(form.fit) || 3));
    patch.notes = form.notes ?? '';
    patch.draft = form.draft ?? '';
    await commit(patch);
  }

  const age = daysAgo(form.postedOn);

  return (
    <form onSubmit={onSubmit}>
      <div className="dgrid">
        {FIELDS.map(([key, label, type]) => (
          <label key={key} htmlFor={`f-${j.id}-${key}`}>
            {label}
            {type === 'status' ? (
              <select
                id={`f-${j.id}-${key}`}
                value={form.status || 'wishlist'}
                onChange={(e) => set('status', e.target.value)}
              >
                {STATUSES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`f-${j.id}-${key}`}
                type={type}
                min={type === 'number' ? 1 : undefined}
                max={type === 'number' ? 5 : undefined}
                value={form[key] ?? ''}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </label>
        ))}

        <label className="wide" htmlFor={`f-${j.id}-draft`}>
          Outreach draft
          <textarea
            id={`f-${j.id}-draft`}
            value={form.draft ?? ''}
            onChange={(e) => set('draft', e.target.value)}
          />
        </label>

        <label className="wide" htmlFor={`f-${j.id}-notes`}>
          Notes {age != null ? <span className="mono">· posting is {age} days old</span> : null}
          <textarea
            id={`f-${j.id}-notes`}
            style={{ minHeight: 140 }}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>

        {form.prepBrief ? (
          <div className="wide">
            <span className="eyebrow">Interview prep brief</span>
            <div className="prep">{form.prepBrief}</div>
          </div>
        ) : null}
      </div>

      <div className="dactions">
        <button className="primary" type="submit" disabled={busy || readOnly}>
          Save
        </button>
        <button
          className="ghost"
          type="button"
          disabled={!form.draft}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(form.draft || '');
              flash('Draft copied');
            } catch {
              flash('Copy failed — select the text instead', true);
            }
          }}
        >
          Copy draft
        </button>
        <button
          className="ghost"
          type="button"
          disabled={busy || readOnly}
          onClick={() => commit(markSentPatch(form), `Marked sent · follow-up in ${FOLLOW_UP_DAYS} days`)}
        >
          Mark message sent
        </button>
        <button
          className="ghost"
          type="button"
          disabled={busy || readOnly}
          onClick={() => commit({ followUpOn: plusDays(7) }, 'Snoozed a week')}
        >
          Snooze a week
        </button>
        {form.url ? (
          <a href={form.url} target="_blank" rel="noopener noreferrer">
            Open job ↗
          </a>
        ) : null}
        {form.contactUrl ? (
          <a href={form.contactUrl} target="_blank" rel="noopener noreferrer">
            Open contact ↗
          </a>
        ) : null}
        <button
          className="ghost danger"
          type="button"
          disabled={busy || readOnly}
          onClick={async () => {
            if (!window.confirm(`Delete the ${form.company} row? This cannot be undone.`)) return;
            const res = await fetch(`/api/jobs/${encodeURIComponent(j.id)}`, { method: 'DELETE' });
            if (res.ok) {
              onDelete(j.id);
              close();
            } else {
              flash('Delete failed', true);
            }
          }}
        >
          Delete
        </button>
        {msg ? <span className={`saved${err ? ' err' : ''}`}>{msg}</span> : null}
      </div>
    </form>
  );
}

/* ---------------- activity ---------------- */

function Activity({ events }) {
  return (
    <section className="card" aria-labelledby="activity-h">
      <div className="card-head">
        <h2 id="activity-h">Activity</h2>
        <span className="eyebrow">Last 30 days</span>
      </div>
      <div className="feed">
        {events.slice(0, 40).map((e, i) => (
          <div className="feed-item" key={i}>
            <span className="feed-when">{fmtWhen(e.at)}</span>
            <span>
              <strong>{e.company || e.job_id}</strong>{' '}
              {e.field === 'created'
                ? 'added to the tracker'
                : `${e.field}: ${e.old_val || '—'} → ${e.new_val || '—'}`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

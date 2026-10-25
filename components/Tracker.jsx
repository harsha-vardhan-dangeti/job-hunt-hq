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

const iso = (d) => d.toISOString().slice(0, 10);
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

export default function Tracker({ initialJobs, initialBrief, events = [], readOnly, loadError }) {
  const [jobs, setJobs] = useState(initialJobs || []);
  const [brief] = useState(initialBrief || {});
  const [view, setView] = useState('board');
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [minFit, setMinFit] = useState(0);
  const [sort, setSort] = useState('priority');
  const [openId, setOpenId] = useState(null);
  const [theme, setTheme] = useState(null);
  const searchRef = useRef(null);

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

      <PaceCard funnel={funnel} counts={counts} />

      <section className="card" aria-labelledby="brief-h">
        <div className="card-head">
          <h2 id="brief-h">Today&apos;s brief</h2>
          <span className="eyebrow">
            {brief.date ? `Updated ${fmtDate(brief.date)}` : 'No brief yet'}
          </span>
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
    </main>
  );
}

/* ---------------- pace ---------------- */

function PaceCard({ funnel, counts }) {
  const needPerWeek = 12;
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
          onClick={() =>
            commit(
              {
                messagedOn: today(),
                followUpOn: plusDays(6),
                status: form.status === 'wishlist' ? 'outreach' : form.status,
              },
              'Marked sent · follow-up in 6 days'
            )
          }
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

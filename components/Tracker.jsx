'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ActivityView from './ActivityView';
import BriefView from './BriefView';
import InsightsView from './InsightsView';
import { DEFAULT_FILTERS, Filters, PipelineView, RolesView, applyFilters, countBy } from './ListViews';
import { buildQueue, daysLeft, today } from './model';
import Nav, { VIEWS } from './Nav';
import ResumesView from './ResumesView';
import RoleDrawer from './RoleDrawer';
import TodayView from './TodayView';

const VIEW_KEYS = VIEWS.map(([k]) => k);

export default function Tracker({
  initialJobs,
  initialBrief,
  initialResume,
  events = [],
  readOnly,
  loadError,
  agentReady,
  gated,
}) {
  const [jobs, setJobs] = useState(initialJobs || []);
  const [brief] = useState(initialBrief || {});
  const [master, setMaster] = useState(initialResume || {});
  const [resumeId, setResumeId] = useState(null);
  const [view, setViewState] = useState('today');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState(null);
  const [theme, setTheme] = useState(null);
  const [toast, setToast] = useState(null);
  /* The screens depend on the viewer's local date, which the server can't know,
     so they render after hydration. */
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  /* The section lives in the URL hash so a reload or a shared link keeps it. */
  useEffect(() => {
    setMounted(true);
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (VIEW_KEYS.includes(h)) setViewState(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function setView(v) {
    setViewState(v);
    if (window.location.hash.slice(1) !== v) window.history.pushState(null, '', `#${v}`);
    window.scrollTo({ top: 0 });
  }

  /* Theme toggle, remembered per browser. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('jhhq_theme');
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
        return;
      }
    } catch {
      /* private window or blocked storage — stay on the system theme */
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  function toggleTheme() {
    const isDark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('jhhq_theme', next);
    } catch {
      /* ignore */
    }
  }

  /* Keyboard: "/" searches roles, number keys switch sections. */
  useEffect(() => {
    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (typing || openId || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        if (view !== 'roles' && view !== 'pipeline') setView('roles');
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      const n = Number(e.key);
      if (n >= 1 && n <= VIEW_KEYS.length) setView(VIEW_KEYS[n - 1]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function showToast(next) {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }

  async function save(id, patch) {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
    setJobs((prev) =>
      prev.map((j) => (j.id === body.saved.id ? { ...j, ...body.saved, _updatedAt: new Date().toISOString() } : j))
    );
    return body.saved;
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

  async function addRow() {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `new-role-${Date.now()}`,
        company: 'New company',
        role: '',
        status: 'wishlist',
        fit: 3,
        source: 'Manual',
      }),
    });
    const body = await res.json().catch(() => ({}));
    const saved = body.saved?.[0];
    if (!res.ok || !saved) {
      showToast({ text: body.error || 'Could not add a role.', error: true });
      return;
    }
    setJobs((prev) => [...prev, saved]);
    setOpenId(saved.id);
  }

  /** Ask the agent to tailor this role's resume now. */
  async function tailor(j) {
    if (
      !window.confirm(
        `Tailor a resume for ${j.company}?\n\nThe agent reads the job description and writes a resume from your master resume only. It takes a few minutes; reload afterwards.`
      )
    )
      return;
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: j.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Couldn't start the agent (${res.status})`);
      const at = body.requestedAt || new Date().toISOString();
      setJobs((prev) => prev.map((x) => (x.id === j.id ? { ...x, resumeRequestedOn: at } : x)));
      showToast({ text: `Tailoring the ${j.company} resume. Reload in a few minutes.` });
    } catch (e) {
      showToast({ text: e.message, error: true });
    }
  }

  function openResume(id) {
    setResumeId(id);
    setOpenId(null);
    setView('resumes');
  }

  async function signOut() {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    window.location.replace('/login');
  }

  const counts = useMemo(() => countBy(jobs), [jobs]);
  const visible = useMemo(() => applyFilters(jobs, filters), [jobs, filters]);
  const funnel = useMemo(() => {
    const left = daysLeft();
    return {
      sent: jobs.filter((j) => j.messagedOn).length,
      applied: jobs.filter((j) => ['applied', 'interviewing', 'offer'].includes(j.status)).length,
      live: counts.interviewing + counts.offer,
      daysLeft: left,
      weeksLeft: Math.max(1, Math.round(left / 7)),
    };
  }, [jobs, counts]);

  /* Today's badge counts what is due (deadlines, interviews, follow-ups), not drafts. */
  const badges = useMemo(() => {
    if (!mounted) return {};
    const urgent = buildQueue(jobs).filter((i) => i.kind !== 'send' && i.kind !== 'pinned').length;
    const fresh = brief.date === today() ? brief.todo?.length : 0;
    return { today: urgent || null, brief: fresh || null, roles: counts.open || null };
  }, [jobs, counts, mounted, brief]);

  const openJob = openId ? jobs.find((j) => j.id === openId) : null;
  const filterProps = { filters, setFilters, counts, searchRef, onAdd: addRow, readOnly };

  return (
    <>
      <Nav
        view={view}
        setView={setView}
        badges={badges}
        daysLeft={funnel.daysLeft}
        theme={theme}
        toggleTheme={toggleTheme}
        onSignOut={gated ? signOut : null}
      />

      <main className="wrap" id="main">
        {loadError ? (
          <div className="banner bad">
            Couldn&apos;t reach Supabase: {loadError}. Check <code>SUPABASE_URL</code> and{' '}
            <code>SUPABASE_SECRET_KEY</code> in your Vercel project settings, and that the migration has been pushed.
          </div>
        ) : null}
        {readOnly ? (
          <div className="banner warn">
            Read-only: no database is connected, so this is the snapshot bundled with the deploy. Connect Supabase (
            <code>SUPABASE_URL</code> and <code>SUPABASE_SECRET_KEY</code>), then POST to <code>/api/seed</code> to import
            these {jobs.length} rows and turn on editing.
          </div>
        ) : null}

        {!mounted ? (
          <p className="muted">Loading your tracker…</p>
        ) : view === 'today' ? (
          <TodayView
            jobs={jobs}
            brief={brief}
            act={act}
            openRole={setOpenId}
            readOnly={readOnly}
            openBrief={() => setView('brief')}
          />
        ) : view === 'brief' ? (
          <BriefView brief={brief} agentReady={agentReady} />
        ) : view === 'resumes' ? (
          <ResumesView
            jobs={jobs}
            master={master}
            setMaster={setMaster}
            selectedId={resumeId}
            setSelectedId={setResumeId}
            tailor={tailor}
            openRole={setOpenId}
            readOnly={readOnly}
            agentReady={agentReady}
          />
        ) : view === 'pipeline' ? (
          <>
            <header className="page-head">
              <h1>Pipeline</h1>
              <p>Every open role by stage. Rejected and dropped roles are under Roles.</p>
            </header>
            <Filters {...filterProps} showPills={false} />
            <PipelineView rows={visible} openRole={setOpenId} act={act} readOnly={readOnly} />
          </>
        ) : view === 'roles' ? (
          <>
            <header className="page-head">
              <h1>Roles</h1>
              <p>
                {visible.length} of {jobs.length} roles shown. Click a row to see its stage, history and details.
              </p>
            </header>
            <Filters {...filterProps} />
            <RolesView rows={visible} total={jobs.length} openRole={setOpenId} />
          </>
        ) : view === 'insights' ? (
          <>
            <header className="page-head">
              <h1>Insights</h1>
              <p>How the search is tracking against your 15 November offer date.</p>
            </header>
            <InsightsView jobs={jobs} events={events} counts={counts} funnel={funnel} />
          </>
        ) : (
          <ActivityView events={events} openRole={setOpenId} />
        )}
      </main>

      {openJob ? (
        <RoleDrawer
          key={openJob.id}
          j={openJob}
          pageEvents={events}
          act={act}
          save={save}
          readOnly={readOnly}
          master={master}
          agentReady={agentReady}
          tailor={tailor}
          openResume={openResume}
          onClose={() => setOpenId(null)}
          onDeleted={(id) => {
            setJobs((prev) => prev.filter((j) => j.id !== id));
            setOpenId(null);
            showToast({ text: 'Role deleted' });
          }}
        />
      ) : null}

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
    </>
  );
}

import { useEffect, useState } from 'react';

const ICONS = {
  today: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  brief: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  pipeline: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z',
  roles: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  resumes: 'M4 5h16v14H4zM9 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6.5 16c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2M14 10h3M14 14h3',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  activity: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

export const VIEWS = [
  ['today', 'Today'],
  ['brief', 'Brief'],
  ['pipeline', 'Pipeline'],
  ['roles', 'Roles'],
  ['resumes', 'Resumes'],
  ['insights', 'Insights'],
  ['activity', 'Activity'],
];

/* Phones get four tabs; the rest sit behind More. */
const PHONE_TABS = ['today', 'brief', 'roles', 'resumes'];

function Icon({ name }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Links({ view, setView, badges, only }) {
  return VIEWS.filter(([k]) => !only || only.includes(k)).map(([k, label]) => (
    <a
      key={k}
      href={`#${k}`}
      aria-current={view === k ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        setView(k);
      }}
    >
      <Icon name={k} />
      <span className="nav-label">{label}</span>
      {badges[k] ? <span className="badge">{badges[k]}</span> : null}
    </a>
  ));
}

function TabBar({ view, setView, badges }) {
  const [open, setOpen] = useState(false);
  const rest = VIEWS.filter(([k]) => !PHONE_TABS.includes(k)).map(([k]) => k);
  const inMore = rest.includes(view);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <nav className="tabbar" aria-label="Sections">
      <Links
        view={view}
        setView={(k) => {
          setOpen(false);
          setView(k);
        }}
        badges={badges}
        only={PHONE_TABS}
      />
      <button
        className="tab-more"
        aria-expanded={open}
        aria-controls="more-sheet"
        aria-current={inMore ? 'page' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
        <span className="nav-label">More</span>
      </button>
      {open ? (
        <>
          <div className="more-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="more-sheet" id="more-sheet">
            <Links
              view={view}
              setView={(k) => {
                setOpen(false);
                setView(k);
              }}
              badges={badges}
              only={rest}
            />
          </div>
        </>
      ) : null}
    </nav>
  );
}

/** Sticky top bar on wide screens; on phones the section links move to a bottom tab bar. */
export default function Nav({ view, setView, badges, daysLeft, theme, toggleTheme, onSignOut }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="brand"
            href="#today"
            onClick={(e) => {
              e.preventDefault();
              setView('today');
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              JH
            </span>
            Job Hunt HQ
          </a>
          <nav className="tabs" aria-label="Sections">
            <Links view={view} setView={setView} badges={badges} />
          </nav>
          <div className="topbar-right">
            <span
              className={`days-left${daysLeft <= 21 ? ' tight' : ''}`}
              title="Days until your 15 November offer date"
            >
              <b>{daysLeft}</b> days left
            </span>
            <button className="ghost" onClick={toggleTheme} aria-label="Switch colour theme">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            {onSignOut ? (
              <button className="ghost" onClick={onSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <TabBar view={view} setView={setView} badges={badges} />
    </>
  );
}

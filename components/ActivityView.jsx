import { useMemo, useState } from 'react';
import { describeEvent, iso, today, plusDays } from './model';

const KINDS = [
  ['all', 'Everything', () => true],
  ['status', 'Stage changes', (e) => e.field === 'status' || e.field === 'created'],
  ['messagedOn', 'Messages', (e) => e.field === 'messagedOn'],
  ['dates', 'Interviews and deadlines', (e) => e.field === 'interviewAt' || e.field === 'deadline'],
];

function dayLabel(day) {
  if (day === today()) return 'Today';
  if (day === plusDays(-1)) return 'Yesterday';
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Everything that changed, grouped by day, newest first. */
export default function ActivityView({ events, openRole }) {
  const [kind, setKind] = useState('all');
  const groups = useMemo(() => {
    const test = KINDS.find(([k]) => k === kind)[2];
    const by = new Map();
    for (const e of events.filter(test)) {
      const day = iso(new Date(e.at));
      if (!by.has(day)) by.set(day, []);
      by.get(day).push(e);
    }
    return [...by.entries()];
  }, [events, kind]);

  return (
    <>
      <header className="page-head">
        <h1>Activity</h1>
        <p>Every stage change, message and interview from the last 90 days, whether you made it here or the agent did.</p>
      </header>
      <div className="stats" role="group" aria-label="Show">
        {KINDS.map(([k, label]) => (
          <button key={k} className="stat" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <section className="card empty-state">
          <h2>No activity yet</h2>
          <p className="muted">
            Changes are logged from the moment the tracker moved to Supabase. Mark a message sent or move a role and it
            shows up here.
          </p>
        </section>
      ) : (
        groups.map(([day, items]) => (
          <section className="card day" key={day} aria-label={dayLabel(day)}>
            <h2>{dayLabel(day)}</h2>
            <ul className="feed">
              {items.map((e, i) => (
                <li key={i}>
                  <button className="feed-item" onClick={() => openRole(e.job_id)}>
                    <span className="feed-when">
                      {new Date(e.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className={`feed-dot k-${e.field}`} aria-hidden="true" />
                    <span>
                      <strong>{e.company || e.job_id}</strong> {describeEvent(e).replace(/^./, (c) => c.toLowerCase())}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

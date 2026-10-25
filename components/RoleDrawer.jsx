import { useEffect, useRef, useState } from 'react';
import {
  CLOSED,
  FOLLOW_UP_DAYS,
  LABEL,
  SNOOZE_DAYS,
  STAGES,
  confirmDrop,
  daysAgo,
  deadlinePassed,
  dueReason,
  fmtDate,
  markSentPatch,
  nextStepText,
  plusDays,
  roleTimeline,
} from './model';
import { Fit } from './parts';

const SECTIONS = [
  [
    'Details',
    [
      ['company', 'Company', 'text'],
      ['role', 'Role', 'text'],
      ['jobId', 'Job or requisition ID', 'text'],
      ['url', 'Job posting link', 'url'],
      ['source', 'Where you found it', 'text'],
      ['fit', 'Fit', 'fit'],
    ],
  ],
  [
    'Contact',
    [
      ['contact', 'Person to reach', 'text'],
      ['contactUrl', 'Their profile link', 'url'],
    ],
  ],
  [
    'Dates',
    [
      ['postedOn', 'Posted on', 'date'],
      ['messagedOn', 'Messaged on', 'date'],
      ['followUpOn', 'Follow up on', 'date'],
      ['deadline', 'Deadline', 'date'],
      ['interviewAt', 'Interview at (IST)', 'datetime-local'],
      ['snoozedUntil', 'Snoozed until', 'date'],
    ],
  ],
];

function Stepper({ j, act, readOnly }) {
  const at = STAGES.indexOf(j.status);
  const closed = CLOSED.has(j.status) && j.status !== 'offer';
  return (
    <div className="stepper-wrap">
      <ol className={`stepper${closed ? ' closed' : ''}`} aria-label="Stage">
        {STAGES.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'todo';
          return (
            <li key={s} className={state}>
              <button
                disabled={readOnly || i === at}
                aria-current={i === at ? 'step' : undefined}
                onClick={() => act(j, { status: s }, `${j.company} moved to ${LABEL[s]}`)}
              >
                <span className="step-dot" aria-hidden="true" />
                <span className="step-label">{LABEL[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="exits">
        {closed ? (
          <span className={`chip s-${j.status}`}>Closed: {LABEL[j.status]}</span>
        ) : (
          <>
            <button
              className="ghost"
              disabled={readOnly}
              onClick={() => act(j, { status: 'rejected' }, `${j.company} marked rejected`)}
            >
              They rejected it
            </button>
            <button
              className="ghost danger"
              disabled={readOnly}
              onClick={() => confirmDrop(j) && act(j, { status: 'dropped' }, `Dropped ${j.company}`)}
            >
              Drop
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NextStep({ j, act, readOnly }) {
  const due = dueReason(j);
  const late = Boolean(due) || deadlinePassed(j);
  const canSend = !CLOSED.has(j.status) && !j.messagedOn;
  return (
    <div className={`next-step${late ? ' late' : ''}`}>
      <div>
        <span className="small muted">Next step</span>
        <p>{nextStepText(j)}</p>
      </div>
      <div className="next-step-actions">
        {canSend ? (
          <button
            className="primary"
            disabled={readOnly}
            onClick={() => act(j, markSentPatch(j), `Sent to ${j.company}. Follow-up in ${FOLLOW_UP_DAYS} days.`)}
          >
            Mark sent
          </button>
        ) : null}
        {due === 'follow-up' ? (
          <button
            className="primary"
            disabled={readOnly}
            onClick={() =>
              act(j, { followUpOn: plusDays(FOLLOW_UP_DAYS) }, `Followed up with ${j.company}. Next in ${FOLLOW_UP_DAYS} days.`)
            }
          >
            Followed up
          </button>
        ) : null}
        {!CLOSED.has(j.status) ? (
          <button
            className="ghost"
            disabled={readOnly}
            onClick={() => act(j, { snoozedUntil: plusDays(SNOOZE_DAYS) }, `${j.company} snoozed ${SNOOZE_DAYS} days`)}
          >
            Snooze {SNOOZE_DAYS} days
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Side panel for one role: where it stands, what's next, its history, and every field. */
export default function RoleDrawer({ j, pageEvents, act, save, readOnly, onClose, onDeleted }) {
  // Only fields the person has changed live here, so agent or one-click updates
  // to other fields show through instead of being overwritten on save.
  const [edits, setEdits] = useState({});
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef(null);
  const dirty = Object.keys(edits).length > 0;
  const value = (k) => edits[k] ?? j[k] ?? '';

  useEffect(() => {
    panelRef.current?.focus();
  }, [j.id]);

  useEffect(() => {
    setEdits({});
    setMsg(null);
  }, [j.id]);

  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${encodeURIComponent(j.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => live && setEvents(b.events || []))
      .catch(() => live && setEvents(null));
    return () => {
      live = false;
    };
  }, [j.id, j.status, j.messagedOn, j.interviewAt, j.deadline]);

  function close() {
    if (dirty && !window.confirm('You have unsaved changes to this role. Close without saving?')) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function set(k, v) {
    setEdits((prev) => {
      const next = { ...prev, [k]: v };
      if ((j[k] ?? '') === v) delete next[k];
      return next;
    });
  }

  async function onSave(e) {
    e.preventDefault();
    const patch = { ...edits };
    if ('fit' in patch) patch.fit = Math.min(5, Math.max(1, Number(patch.fit) || 3));
    setBusy(true);
    try {
      await save(j.id, patch);
      setEdits({});
      setMsg({ text: 'Changes saved' });
    } catch (err) {
      setMsg({ text: err.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete ${j.company} for good? Its history goes too. Drop it instead to keep the record.`)) return;
    const res = await fetch(`/api/jobs/${encodeURIComponent(j.id)}`, { method: 'DELETE' });
    if (res.ok) onDeleted(j.id);
    else setMsg({ text: 'Delete failed. Try again.', error: true });
  }

  const timeline = roleTimeline(j, events ?? pageEvents);
  const age = daysAgo(j.postedOn);

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-h" ref={panelRef} tabIndex={-1}>
        <header className="drawer-head">
          <div>
            <h2 id="drawer-h">{j.company}</h2>
            <p className="role">{j.role || 'Role to pick'}</p>
            <div className="drawer-meta">
              <Fit n={j.fit} />
              {age != null ? <span className="small muted">Posted {age} days ago</span> : null}
              {j.url ? (
                <a href={j.url} target="_blank" rel="noopener noreferrer">
                  Job posting ↗
                </a>
              ) : null}
              {j.contactUrl ? (
                <a href={j.contactUrl} target="_blank" rel="noopener noreferrer">
                  Contact ↗
                </a>
              ) : null}
            </div>
          </div>
          <button className="ghost icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="drawer-body">
          <Stepper j={j} act={act} readOnly={readOnly} />
          <NextStep j={j} act={act} readOnly={readOnly} />

          <form id="role-form" onSubmit={onSave} className="drawer-form">
            <section className="dsec">
              <div className="dsec-head">
                <h3>Your message</h3>
                <button
                  type="button"
                  className="ghost"
                  disabled={!value('draft')}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(value('draft'));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setMsg({ text: 'Copy failed. Select the text instead.', error: true });
                    }
                  }}
                >
                  {copied ? 'Copied' : 'Copy message'}
                </button>
              </div>
              <textarea
                aria-label="Outreach message"
                placeholder="The referral or outreach message for this role."
                value={value('draft')}
                onChange={(e) => set('draft', e.target.value)}
              />
            </section>

            {SECTIONS.map(([title, fields]) => (
              <section className="dsec" key={title}>
                <h3>{title}</h3>
                <div className="dgrid">
                  {fields.map(([key, label, type]) => (
                    <label key={key} className={edits[key] !== undefined ? 'edited' : ''}>
                      {label}
                      {type === 'fit' ? (
                        <select value={value('fit') || 3} onChange={(e) => set('fit', Number(e.target.value))}>
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} of 5
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input type={type} value={value(key)} onChange={(e) => set(key, e.target.value)} />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <section className="dsec">
              <h3>Notes</h3>
              <textarea
                aria-label="Notes"
                className="tall"
                value={value('notes')}
                onChange={(e) => set('notes', e.target.value)}
              />
            </section>

            {j.prepBrief ? (
              <section className="dsec">
                <h3>Interview prep</h3>
                <div className="prep">{j.prepBrief}</div>
              </section>
            ) : null}
          </form>

          <section className="dsec">
            <h3>History</h3>
            {timeline.length ? (
              <ol className="timeline">
                {timeline.map((t, i) => (
                  <li key={i} className={`k-${t.kind}`}>
                    <span className="tl-when">{fmtDate(String(t.at))}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">No history yet.</p>
            )}
          </section>
        </div>

        <footer className="drawer-foot">
          <button className="primary" type="submit" form="role-form" disabled={busy || readOnly || !dirty}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {dirty ? (
            <button className="ghost" type="button" onClick={() => setEdits({})}>
              Discard
            </button>
          ) : null}
          {msg ? <span className={`saved${msg.error ? ' err' : ''}`}>{msg.text}</span> : null}
          {dirty && !msg ? <span className="small muted">Unsaved changes</span> : null}
          <span className="spacer" />
          <button className="ghost danger" type="button" disabled={readOnly} onClick={onDelete}>
            Delete
          </button>
        </footer>
      </aside>
    </div>
  );
}

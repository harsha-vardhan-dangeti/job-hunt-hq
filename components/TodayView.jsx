import { useMemo, useState } from 'react';
import {
  DAILY_TARGET,
  DECIDE_AFTER,
  FOLLOW_UP_DAYS,
  QUEUE_SIZE,
  SNOOZE_DAYS,
  buildQueue,
  confirmDrop,
  daysAgo,
  daysLeft,
  deadlinePassed,
  fmtDate,
  fmtWhen,
  greeting,
  markSentPatch,
  needsDecision,
  plusDays,
  today,
} from './model';
import { Fit } from './parts';

function queueReason({ j, kind }) {
  if (kind === 'deadline') return `Deadline ${fmtDate(j.deadline)}`;
  if (kind === 'interview') return `Interview ${fmtWhen(j.interviewAt)}`;
  if (kind === 'follow-up') return `Follow-up due. You messaged them ${fmtDate(j.messagedOn)}.`;
  if (kind === 'pinned') return 'You picked this to do now';
  const age = daysAgo(j.addedOn);
  return `Draft ready${age != null ? `, on your list ${age} days` : ''}`;
}

/** The buttons a queue item offers, most useful first. Shared by the hero card
 *  and the compact rows so both behave the same. */
function queueActions({ j, kind }) {
  const urgent = kind === 'deadline' || kind === 'interview';
  const list = [];
  if (kind === 'send' || kind === 'pinned')
    list.push({ label: 'Mark sent', patch: markSentPatch(j), done: `Sent to ${j.company}. Follow-up in ${FOLLOW_UP_DAYS} days.`, primary: true });
  else if (kind === 'follow-up')
    list.push({ label: 'Followed up', patch: { followUpOn: plusDays(FOLLOW_UP_DAYS) }, done: `Followed up with ${j.company}. Next in ${FOLLOW_UP_DAYS} days.`, primary: true });
  else list.push({ label: 'Open role', open: true, primary: true });
  if (!urgent)
    list.push({
      label: `Snooze ${SNOOZE_DAYS} days`,
      patch: kind === 'follow-up' ? { followUpOn: plusDays(SNOOZE_DAYS) } : { snoozedUntil: plusDays(SNOOZE_DAYS) },
      done: `${j.company} snoozed ${SNOOZE_DAYS} days`,
    });
  if (kind !== 'interview') list.push({ label: 'Drop', patch: { status: 'dropped' }, done: `Dropped ${j.company}`, danger: true, confirm: true });
  return list;
}

function ActionButtons({ item, act, openRole, readOnly, compact }) {
  const [busy, setBusy] = useState(false);
  async function run(a) {
    if (a.open) return openRole(item.j.id);
    if (a.confirm && !confirmDrop(item.j)) return;
    setBusy(true);
    await act(item.j, a.patch, a.done);
    setBusy(false);
  }
  return queueActions(item).map((a) => (
    <button
      key={a.label}
      className={a.primary ? 'primary' : `ghost${a.danger ? ' danger' : ''}`}
      disabled={busy || (readOnly && !a.open)}
      onClick={() => run(a)}
    >
      {compact && a.label.startsWith('Snooze') ? 'Snooze' : a.label}
    </button>
  ));
}

function Links({ j }) {
  return (
    <>
      {j.url ? (
        <a className="qlink" href={j.url} target="_blank" rel="noopener noreferrer">
          Job posting ↗
        </a>
      ) : null}
      {j.contactUrl ? (
        <a className="qlink" href={j.contactUrl} target="_blank" rel="noopener noreferrer">
          Contact ↗
        </a>
      ) : null}
    </>
  );
}

/** The single most useful thing to do right now, with everything needed to do it. */
function NextMove({ item, act, openRole, readOnly }) {
  const { j, kind } = item;
  const urgent = kind === 'deadline' || kind === 'interview';
  const [copied, setCopied] = useState(false);
  return (
    <article className={`next-move${urgent ? ' urgent' : ''}`} aria-labelledby="next-h">
      <p className="next-label">Your next move</p>
      <div className="next-who">
        <div>
          <h2 id="next-h">
            <button className="linklike" onClick={() => openRole(j.id)}>
              {j.company}
            </button>
          </h2>
          <p className="next-role">{j.role || 'Role to pick'}</p>
        </div>
        <Fit n={j.fit} />
      </div>
      <p className={`qreason${urgent || kind === 'follow-up' ? ' late' : ''}`}>{queueReason(item)}</p>
      {j.draft && !urgent ? (
        <div className="next-draft">
          <div className="next-draft-head">
            <span>Your message</span>
            <button
              className="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(j.draft);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  openRole(j.id);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy message'}
            </button>
          </div>
          <p>{j.draft}</p>
        </div>
      ) : null}
      <div className="qactions">
        <ActionButtons item={item} act={act} openRole={openRole} readOnly={readOnly} />
        <Links j={j} />
      </div>
    </article>
  );
}

function QueueRow({ item, act, openRole, readOnly }) {
  const { j, kind } = item;
  const urgent = kind === 'deadline' || kind === 'interview';
  return (
    <li className="qrow">
      <button className="qrow-main" onClick={() => openRole(j.id)}>
        <span className="co">{j.company}</span>
        <span className="role">{j.role || 'Role to pick'}</span>
        <span className={`qreason${urgent || kind === 'follow-up' ? ' late' : ''}`}>{queueReason(item)}</span>
      </button>
      <Fit n={j.fit} />
      <div className="qrow-actions">
        <ActionButtons item={item} act={act} openRole={openRole} readOnly={readOnly} compact />
      </div>
    </li>
  );
}

/** One line on Today pointing at the full brief, which has its own section. */
function BriefTeaser({ brief, openBrief }) {
  const fresh = brief.date === today();
  const counts = [
    brief.todo?.length ? `${brief.todo.length} to-dos` : '',
    brief.inbox?.length ? `${brief.inbox.length} inbox notes` : '',
  ].filter(Boolean);
  return (
    <section className="card brief-teaser" aria-labelledby="brief-h">
      <div>
        <h2 id="brief-h">Morning brief</h2>
        <p className="muted small">
          {brief.date
            ? `Written ${fmtDate(brief.date)}${fresh ? '' : ', not refreshed today'}${
                counts.length ? `, with ${counts.join(' and ')}` : ''
              }.`
            : 'No brief yet. The agent writes one at 8:30 every weekday.'}
        </p>
      </div>
      {brief.todo?.[0] ? <p className="teaser-line">{brief.todo[0]}</p> : null}
      <button className="ghost" style={{ justifySelf: 'start' }} onClick={openBrief}>
        Read the brief
      </button>
    </section>
  );
}


function DecideCard({ jobs, act, openRole, readOnly }) {
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
              <button className="linklike co" onClick={() => openRole(j.id)}>
                {j.company}
              </button>
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


export default function TodayView({ jobs, brief, act, openRole, readOnly, openBrief }) {
  const queue = useMemo(() => buildQueue(jobs), [jobs]);
  const sentToday = jobs.filter((j) => j.messagedOn === today()).length;
  const [first, ...rest] = queue;
  const shown = rest.slice(0, QUEUE_SIZE - 1);
  const dateLine = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const left = daysLeft();

  return (
    <>
      <header className="page-head">
        <h1>{greeting()}.</h1>
        <p>
          {dateLine}. {sentToday} of {DAILY_TARGET} messages sent today, {left} days to your 15 November offer date.
        </p>
      </header>

      {first ? (
        <NextMove item={first} act={act} openRole={openRole} readOnly={readOnly} />
      ) : (
        <section className="card empty-state">
          <h2>Nothing queued</h2>
          <p className="muted">
            Roles with a deadline, an interview, a follow-up due or a fit-4+ draft land here. Add a role or run the agent
            to fill it.
          </p>
        </section>
      )}

      {shown.length ? (
        <section className="card" aria-labelledby="then-h">
          <div className="card-head">
            <h2 id="then-h">Then</h2>
            <span className="eyebrow">
              {queue.length - 1} more in the queue{queue.length - 1 > shown.length ? `, showing ${shown.length}` : ''}
            </span>
          </div>
          <ul className="qlist">
            {shown.map((item) => (
              <QueueRow key={item.j.id} item={item} act={act} openRole={openRole} readOnly={readOnly} />
            ))}
          </ul>
        </section>
      ) : null}

      <DecideCard jobs={jobs} act={act} openRole={openRole} readOnly={readOnly} />
      <BriefTeaser brief={brief} openBrief={openBrief} />
    </>
  );
}

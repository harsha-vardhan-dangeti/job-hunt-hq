import { useMemo, useState } from 'react';
import {
  CLOSED,
  DAILY_TARGET,
  DECIDE_AFTER,
  FOLLOW_UP_DAYS,
  OFFER_BY,
  QUEUE_SIZE,
  SNOOZE_DAYS,
  WEEKLY_TARGET,
  buildQueue,
  confirmDrop,
  dailyActivity,
  daysAgo,
  daysLeft,
  deadlinePassed,
  fmtDate,
  fmtWhen,
  greeting,
  markAppliedPatch,
  markSentPatch,
  needsDecision,
  plusDays,
  today,
  weekActivity,
} from './model';
import { Fit, Motion } from './parts';
import { AgentLine } from './AgentRun';
import { atsFor, resumeState } from './resume';
import { ATS_TARGET } from './ats';

function queueReason({ j, kind }) {
  if (kind === 'deadline') return `Deadline ${fmtDate(j.deadline)}`;
  if (kind === 'interview') return `Interview ${fmtWhen(j.interviewAt)}`;
  if (kind === 'debrief') return `Interview was ${fmtWhen(j.interviewAt)}. How did it go?`;
  if (kind === 'follow-up') return `Follow-up due. You messaged them ${fmtDate(j.messagedOn)}.`;
  if (kind === 'pinned') return 'You picked this to do now';
  const age = daysAgo(j.addedOn);
  return `Draft ready${age === 0 ? ", added today" : age != null ? `, on your list ${age} days` : ''}`;
}

/** The buttons a queue item offers, most useful first. Shared by the hero card
 *  and the compact rows so both behave the same. */
function queueActions({ j, kind }) {
  const urgent = kind === 'deadline' || kind === 'interview';
  const list = [];
  if (kind === 'debrief') {
    // A next round needs its new time, which is set on the role itself.
    return [
      { label: 'Next round', open: true, primary: true },
      {
        label: 'Waiting to hear',
        patch: { debriefOn: today(), status: 'interviewing', followUpOn: plusDays(3) },
        done: `Noted. Follow up with ${j.company} in 3 days if they're quiet.`,
      },
      { label: 'Got an offer', patch: { status: 'offer' }, done: `Offer from ${j.company} recorded` },
      { label: 'Rejected', patch: { status: 'rejected' }, done: `${j.company} marked rejected`, danger: true },
    ];
  }
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
      {compact && a.label.startsWith('Snooze') ? 'Snooze' : compact && a.label === 'Waiting to hear' ? 'Waiting' : a.label}
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
    <article className={`next-move${urgent ? ' urgent' : ''}`} aria-labelledby="next-h" data-kind={kind}>
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
      {kind === 'interview' ? (
        <div className="next-draft">
          <div className="next-draft-head">
            <span>Your prep notes</span>
          </div>
          {j.prepBrief ? (
            <p className="clamp-6">{j.prepBrief}</p>
          ) : (
            <p className="muted">
              No prep notes yet. Open the role to add what to revise, questions to ask and who you're meeting.
            </p>
          )}
        </div>
      ) : null}
      {j.draft && !urgent && kind !== 'debrief' ? (
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
    <section className="card brief-teaser" aria-labelledby="brief-h" data-area="brief">
      <div>
        <h2 id="brief-h">Morning brief</h2>
        <p className="muted small">
          {brief.date
            ? `Written ${fmtDate(brief.date)}${fresh ? '' : ', not refreshed today'}${
                counts.length ? `, with ${counts.join(' and ')}` : ''
              }.`
            : 'No brief yet. The agent writes one at 8 every morning.'}
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
    <section className="card" aria-labelledby="decide-h" data-area="decide">
      <div className="card-head">
        <h2 id="decide-h">Decide or drop</h2>
        <span className="eyebrow">
          {rows.length} role{rows.length === 1 ? '' : 's'} past a deadline or {DECIDE_AFTER}+ days with nothing sent
        </span>
      </div>
      <div className="decide">
        {shown.map((j) => (
          <Motion key={j.id}>
            <div className="drow">
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
          </Motion>
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


/* An interview that hasn't happened yet (or is on right now). */
const upcoming = (j) => Boolean(j.interviewAt) && Date.parse(j.interviewAt) > Date.now() - 2 * 60 * 60 * 1000;

/** Today's numbers against the pace an offer by 15 November needs. */
function Pace({ jobs, events }) {
  const days = useMemo(() => dailyActivity(jobs, events), [jobs, events]);
  const sentToday = days[today()]?.sent || 0;
  const week = weekActivity(days);
  const weekTotal = week.sent + week.applied;
  const soon = jobs.filter(
    (j) => !CLOSED.has(j.status) && upcoming(j) && j.interviewAt.slice(0, 10) <= plusDays(6)
  ).length;
  const live = jobs.filter((j) => j.status === 'interviewing' || j.status === 'offer').length;
  const left = daysLeft();
  const pct = (n, d) => `${Math.min(100, Math.round((n / d) * 100))}%`;

  return (
    <section className="pace" aria-label="Your pace">
      <div className={`pace-tile${sentToday >= DAILY_TARGET ? ' met' : ''}`}>
        <span className="eyebrow">Sent today</span>
        <b>
          {sentToday}
          <small> / {DAILY_TARGET}</small>
        </b>
        <div className="meter" aria-hidden="true">
          <span style={{ width: pct(sentToday, DAILY_TARGET) }} />
        </div>
      </div>
      <div className={`pace-tile${weekTotal >= WEEKLY_TARGET ? ' met' : ''}`}>
        <span className="eyebrow">This week</span>
        <b>
          {weekTotal}
          <small> / {WEEKLY_TARGET}</small>
        </b>
        <div className="meter" aria-hidden="true">
          <span style={{ width: pct(weekTotal, WEEKLY_TARGET) }} />
        </div>
        <span className="muted small">
          {week.sent} sent, {week.applied} applied
        </span>
      </div>
      <div className="pace-tile">
        <span className="eyebrow">Interviews</span>
        <b>
          {soon}
          <small> in 7 days</small>
        </b>
        <span className="muted small">
          {live} role{live === 1 ? '' : 's'} interviewing or at offer
        </span>
      </div>
      <div className={`pace-tile${left <= 21 ? ' tight' : ''}`}>
        <span className="eyebrow">Offer date</span>
        <b>
          {left}
          <small> days left</small>
        </b>
        <span className="muted small">To {fmtDate(OFFER_BY)}, to join in January</span>
      </div>
    </section>
  );
}

const dayName = (d) => {
  if (d === today()) return 'Today';
  if (d === plusDays(1)) return 'Tomorrow';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
};
const timeOf = (v) => new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Interviews, deadlines and follow-ups over the next seven days, by day. */
function Week({ jobs, openRole }) {
  const groups = useMemo(() => {
    const from = today();
    const to = plusDays(6);
    const items = [];
    for (const j of jobs) {
      if (CLOSED.has(j.status)) continue;
      const iv = j.interviewAt?.slice(0, 10);
      if (iv && iv >= from && iv <= to && upcoming(j))
        items.push({ j, day: iv, sort: j.interviewAt, kind: 'interview', text: `Interview at ${timeOf(j.interviewAt)}` });
      if (j.deadline && j.deadline >= from && j.deadline <= to)
        items.push({ j, day: j.deadline, sort: `${j.deadline}T23`, kind: 'deadline', text: 'Deadline' });
      if (j.followUpOn && j.followUpOn >= from && j.followUpOn <= to && ['outreach', 'applied', 'interviewing'].includes(j.status))
        items.push({ j, day: j.followUpOn, sort: `${j.followUpOn}T22`, kind: 'follow-up', text: 'Follow up' });
    }
    if (OFFER_BY >= from && OFFER_BY <= to) items.push({ day: OFFER_BY, sort: `${OFFER_BY}T24`, kind: 'goal', text: 'Your offer date' });
    items.sort((a, b) => a.sort.localeCompare(b.sort));
    const byDay = new Map();
    for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) || []), it]);
    return [...byDay];
  }, [jobs]);

  return (
    <section className="card week" aria-labelledby="week-h" data-area="week">
      <div className="card-head">
        <h2 id="week-h">This week</h2>
        <span className="eyebrow">Next 7 days</span>
      </div>
      {groups.length ? (
        <ol className="agenda">
          {groups.map(([day, items]) => (
            <li key={day}>
              <p className={`agenda-day${day === today() ? ' now' : ''}`}>{dayName(day)}</p>
              <ul>
                {items.map((it, i) => (
                  <li key={i} className={`agenda-item ${it.kind}`}>
                    {it.j ? (
                      <button className="agenda-main" onClick={() => openRole(it.j.id)}>
                        <span className="agenda-what">{it.text}</span>
                        <span className="co">{it.j.company}</span>
                        <span className="role">{it.j.role}</span>
                      </button>
                    ) : (
                      <span className="agenda-main">
                        <span className="agenda-what">{it.text}</span>
                        <span className="role">Offer in hand by today to join in January</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">
          Nothing booked. Interviews, deadlines and follow-up dates you set on a role show up here.
        </p>
      )}
    </section>
  );
}

/** Roles with a tailored resume that haven't been applied to yet. */
function ReadyToApply({ jobs, master, act, openRole, openResume, readOnly }) {
  const rows = useMemo(
    () =>
      jobs
        .filter((j) => ['wishlist', 'outreach'].includes(j.status) && j.resume && resumeState(j, master) !== 'requested')
        .map((j) => ({ j, ats: master.text ? atsFor(j, master.text).tailored?.score ?? null : null, stale: resumeState(j, master) === 'stale' }))
        .sort((a, b) => (b.j.fit || 0) - (a.j.fit || 0) || (b.ats ?? 0) - (a.ats ?? 0)),
    [jobs, master]
  );
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return null;
  const shown = showAll ? rows : rows.slice(0, 4);

  return (
    <section className="card" aria-labelledby="ready-h" data-area="ready">
      <div className="card-head">
        <h2 id="ready-h">Ready to apply</h2>
        <span className="eyebrow">
          {rows.length} tailored resume{rows.length === 1 ? '' : 's'} not sent yet
        </span>
      </div>
      <ul className="qlist">
        {shown.map(({ j, ats, stale }) => (
          <Motion key={j.id}>
            <li className="qrow">
              <button className="qrow-main" onClick={() => openRole(j.id)}>
                <span className="co">{j.company}</span>
                <span className="role">{j.role || 'Role to pick'}</span>
                <span className="qreason">
                  {ats != null ? (
                    <span className={`ats-tag ${ats >= ATS_TARGET ? 'ok' : 'warn'}`}>ATS {ats}</span>
                  ) : null}{' '}
                  {stale ? 'Your master resume changed since; tailor it again first.' : `Tailored ${fmtDate(j.resume.generatedOn)}`}
                </span>
              </button>
              <Fit n={j.fit} />
              <div className="qrow-actions">
                <button className="ghost" onClick={() => openResume(j.id)}>
                  Resume
                </button>
                {j.url ? (
                  <a className="qlink" href={j.url} target="_blank" rel="noopener noreferrer">
                    Apply ↗
                  </a>
                ) : null}
                <button
                  className="primary"
                  disabled={readOnly}
                  onClick={() => act(j, markAppliedPatch(), `Applied to ${j.company}. Follow-up in ${FOLLOW_UP_DAYS} days.`)}
                >
                  Mark applied
                </button>
              </div>
            </li>
          </Motion>
        ))}
      </ul>
      {rows.length > 4 ? (
        <button className="ghost" style={{ justifySelf: 'start' }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      ) : null}
    </section>
  );
}

/** What the agent found since yesterday, best fit first, to keep or drop. */
function NewRoles({ jobs, act, openRole, readOnly }) {
  const since = plusDays(-1);
  const rows = jobs
    .filter((j) => j.status === 'wishlist' && j.addedOn >= since)
    .sort((a, b) => (b.fit || 0) - (a.fit || 0) || String(b.postedOn || '').localeCompare(String(a.postedOn || '')));
  if (!rows.length) return null;

  return (
    <section className="card" aria-labelledby="new-h" data-area="new">
      <div className="card-head">
        <h2 id="new-h">New roles</h2>
        <span className="eyebrow">{rows.length} added since yesterday</span>
      </div>
      <ul className="new-list">
        {rows.slice(0, 6).map((j) => {
          const age = daysAgo(j.postedOn);
          return (
            <Motion key={j.id}>
              <li>
                <button className="new-main" onClick={() => openRole(j.id)}>
                  <span className="co">{j.company}</span>
                  <span className="role">{j.role || 'Role to pick'}</span>
                  <span className="muted small">
                    {age != null ? `Posted ${age === 0 ? 'today' : `${age}d ago`}` : 'Posting date unknown'}
                    {j.jd ? '' : ', no job description yet'}
                  </span>
                </button>
                <Fit n={j.fit} />
                <button
                  className="ghost danger"
                  disabled={readOnly}
                  onClick={() => confirmDrop(j) && act(j, { status: 'dropped' }, `Dropped ${j.company}`)}
                  aria-label={`Drop ${j.company}`}
                >
                  Drop
                </button>
              </li>
            </Motion>
          );
        })}
      </ul>
      {rows.length > 6 ? <p className="muted small">And {rows.length - 6} more under Roles.</p> : null}
    </section>
  );
}

export default function TodayView({
  jobs,
  brief,
  events = [],
  master = {},
  runs = [],
  act,
  openRole,
  openResume,
  readOnly,
  openBrief,
}) {
  const queue = useMemo(() => buildQueue(jobs), [jobs]);
  const [first, ...rest] = queue;
  const shown = rest.slice(0, QUEUE_SIZE - 1);
  const dateLine = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <header className="page-head">
        <h1>{greeting()}</h1>
        <p>{dateLine}.</p>
      </header>

      <Pace jobs={jobs} events={events} />
      <AgentLine runs={runs} openBrief={openBrief} />

      <div className="today-grid">
        <div className="today-main">
          {first ? (
            <Motion key={first.j.id}>
              <div data-area="next">
                <NextMove item={first} act={act} openRole={openRole} readOnly={readOnly} />
              </div>
            </Motion>
          ) : (
            <section className="card empty-state" data-area="next">
              <h2>Nothing queued</h2>
              <p className="muted">
                Roles with a deadline, an interview, a follow-up due or a fit-4+ draft land here. Add a role or run the
                agent to fill it.
              </p>
            </section>
          )}

          {shown.length ? (
            <Motion>
              <section className="card" aria-labelledby="then-h" data-area="then">
                <div className="card-head">
                  <h2 id="then-h">Then</h2>
                  <span className="eyebrow">
                    {queue.length - 1} more in the queue{queue.length - 1 > shown.length ? `, showing ${shown.length}` : ''}
                  </span>
                </div>
                <ul className="qlist">
                  {shown.map((item) => (
                    <Motion key={item.j.id}>
                      <QueueRow item={item} act={act} openRole={openRole} readOnly={readOnly} />
                    </Motion>
                  ))}
                </ul>
              </section>
            </Motion>
          ) : null}

          <Motion>
            <ReadyToApply
              jobs={jobs}
              master={master}
              act={act}
              openRole={openRole}
              openResume={openResume}
              readOnly={readOnly}
            />
          </Motion>
          <Motion>
            <DecideCard jobs={jobs} act={act} openRole={openRole} readOnly={readOnly} />
          </Motion>
        </div>

        <div className="today-side">
          <Motion>
            <Week jobs={jobs} openRole={openRole} />
          </Motion>
          <Motion>
            <NewRoles jobs={jobs} act={act} openRole={openRole} readOnly={readOnly} />
          </Motion>
          <Motion>
            <BriefTeaser brief={brief} openBrief={openBrief} />
          </Motion>
        </div>
      </div>
    </>
  );
}

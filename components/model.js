/* Shared rules and helpers for the tracker: statuses, dates, the Today queue
   and the activity counts. No React in here. */

export const STATUSES = [
  ['wishlist', 'Wishlist'],
  ['outreach', 'Outreach sent'],
  ['applied', 'Applied'],
  ['interviewing', 'Interviewing'],
  ['offer', 'Offer'],
  ['rejected', 'Rejected'],
  ['dropped', 'Dropped'],
];
export const LABEL = Object.fromEntries(STATUSES);
export const CLOSED = new Set(['offer', 'rejected', 'dropped']);
export const BOARD_COLUMNS = ['wishlist', 'outreach', 'applied', 'interviewing', 'offer'];

/* The date an offer should be in hand by, to join in January. */
export const OFFER_BY = '2026-11-15';

export const FIELDS = [
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
export const WEEKLY_TARGET = 12;
export const DAILY_TARGET = 3;
export const FOLLOW_UP_DAYS = 5;
export const SNOOZE_DAYS = 3;
/* A wishlist row untouched this long asks for a decision. */
export const DECIDE_AFTER = 10;
export const QUEUE_SIZE = 5;

/** YYYY-MM-DD in the viewer's own timezone, so "today" flips at local midnight. */
export const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const today = () => iso(new Date());
export function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function fmtWhen(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
export function daysAgo(v) {
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** A row needs action when a deadline, interview or follow-up has come due. */
export function dueReason(j) {
  if (CLOSED.has(j.status)) return null;
  if (j.deadline && j.deadline <= plusDays(1)) return 'deadline';
  if (j.interviewAt && j.interviewAt.slice(0, 10) <= plusDays(1)) return 'interview';
  if (j.followUpOn && j.followUpOn <= today()) return 'follow-up';
  return null;
}
/** A wishlist row nobody has touched in three weeks. */
export function isStale(j) {
  return j.status === 'wishlist' && !j.messagedOn && (daysAgo(j.addedOn) ?? 0) > 21;
}

/** Drop is one click from the queue, so check first. */
export function confirmDrop(j) {
  return window.confirm(
    `Drop ${j.company}${j.role ? ` – ${j.role}` : ''}?\n\nIt leaves Today and your open list. You can undo right after, or set the status back later.`
  );
}

export const isSnoozed = (j) => Boolean(j.snoozedUntil && j.snoozedUntil > today());
/** The deadline has already gone by: nothing to do today, only a decision. */
export const deadlinePassed = (j) => !CLOSED.has(j.status) && Boolean(j.deadline && j.deadline < today());

/** The fields "Mark sent" sets, shared by the queue and the detail editor. */
export function markSentPatch(j) {
  return {
    messagedOn: today(),
    followUpOn: plusDays(FOLLOW_UP_DAYS),
    status: j.status === 'wishlist' ? 'outreach' : j.status,
    pinnedOn: '',
  };
}

/** What to do today, most urgent first: anything due, roles you pinned, then
 *  the best-fit roles that have a draft written but no message sent. */
export function buildQueue(jobs) {
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
export function needsDecision(j) {
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
export function dailyActivity(jobs, events) {
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

/* The forward path a role moves along; rejected and dropped are exits from it. */
export const STAGES = ['wishlist', 'outreach', 'applied', 'interviewing', 'offer'];

export function daysLeft() {
  return Math.max(0, Math.ceil((new Date(`${OFFER_BY}T00:00:00+05:30`) - Date.now()) / 86400000));
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** "Indeed · posted 23 Jul" and "Indeed" are the same source, as are
 *  "Target list; req surfaced via Indeed" and "Target list". */
export function sourceName(j) {
  const s = String(j.source || '').split(/ · |;|,/)[0].trim();
  return s || 'Not recorded';
}

export const ADVANCED = new Set(['outreach', 'applied', 'interviewing', 'offer', 'rejected']);
export const wasContacted = (j) => Boolean(j.messagedOn) || ADVANCED.has(j.status);
export const wasApplied = (j) => ['applied', 'interviewing', 'offer', 'rejected'].includes(j.status);

const EVENT_TEXT = {
  status: (e) => `Moved from ${LABEL[e.old_val] || e.old_val || '—'} to ${LABEL[e.new_val] || e.new_val || '—'}`,
  messagedOn: (e) => (e.new_val ? `Message sent ${fmtDate(e.new_val)}` : 'Message date cleared'),
  interviewAt: (e) => (e.new_val ? `Interview set for ${fmtWhen(e.new_val)}` : 'Interview time cleared'),
  deadline: (e) => (e.new_val ? `Deadline set for ${fmtDate(e.new_val)}` : 'Deadline cleared'),
  created: (e) => `Added to the tracker as ${LABEL[e.new_val] || e.new_val || 'Wishlist'}`,
};
export const describeEvent = (e) => (EVENT_TEXT[e.field] || ((x) => `${x.field} changed`))(e);

/** Everything known about one role, newest first: logged events plus the dates
 *  on the row itself, for roles that predate the activity log. */
export function roleTimeline(j, events) {
  const items = events
    .filter((e) => e.job_id === j.id)
    .map((e) => ({ at: e.at, text: describeEvent(e), kind: e.field }));
  const logged = new Set(items.map((i) => i.kind));
  if (!logged.has('created') && j.addedOn) items.push({ at: j.addedOn, text: 'Added to the tracker', kind: 'created' });
  if (!logged.has('messagedOn') && j.messagedOn) items.push({ at: j.messagedOn, text: 'Message sent', kind: 'messagedOn' });
  if (j.postedOn) items.push({ at: j.postedOn, text: 'Job posted', kind: 'posted' });
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** What a row needs next, in words, for tables and the role panel. */
export function nextStepText(j) {
  if (CLOSED.has(j.status)) return LABEL[j.status];
  if (deadlinePassed(j)) return `Deadline ${fmtDate(j.deadline)} passed`;
  const due = dueReason(j);
  if (due === 'deadline') return `Deadline ${fmtDate(j.deadline)}`;
  if (due === 'interview') return `Interview ${fmtWhen(j.interviewAt)}`;
  if (due === 'follow-up') return 'Follow up now';
  if (isSnoozed(j)) return `Snoozed to ${fmtDate(j.snoozedUntil)}`;
  if (j.followUpOn) return `Follow up ${fmtDate(j.followUpOn)}`;
  if (j.status === 'wishlist') return j.draft ? 'Send the draft' : 'Write a draft';
  return '—';
}

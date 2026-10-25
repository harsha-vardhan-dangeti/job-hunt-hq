import { useMemo, useState } from 'react';
import {
  DAILY_TARGET,
  WEEKLY_TARGET,
  dailyActivity,
  fmtDate,
  plusDays,
  sourceName,
  today,
  wasApplied,
  wasContacted,
} from './model';

const CHART_DAYS = 14;

export function Insights({ jobs, events, counts }) {
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

  const contacted = jobs.filter(wasContacted).length;
  const applied = jobs.filter(wasApplied).length;
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
        <h2 id="insights-h">Momentum</h2>
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

export function PaceCard({ funnel, counts }) {
  const needPerWeek = WEEKLY_TARGET;
  const behind = funnel.live < 2 && funnel.daysLeft < 45;
  const verdict = behind
    ? `Behind. ${funnel.live} live interview loop${funnel.live === 1 ? '' : 's'} with ${funnel.daysLeft} days to go. An offer by 15 November needs interviews running now, so send ${needPerWeek} messages this week.`
    : `${funnel.live} live loop${funnel.live === 1 ? '' : 's'}, ${funnel.weeksLeft} weeks left. Keep ${needPerWeek} outreach messages a week going.`;

  return (
    <section className={`banner ${behind ? 'bad' : 'warn'}`} aria-label="Pace check">
      <strong>Pace:</strong> {verdict} Tracked: {counts.all} roles, {funnel.sent} contacted,{' '}
      {funnel.applied} applied, {counts.interviewing} interviewing, {counts.offer} offer
      {counts.offer === 1 ? '' : 's'}.
    </section>
  );
}


/** Which sources produce roles you act on, so search time goes where it pays. */
function SourceTable({ jobs }) {
  const rows = useMemo(() => {
    const by = {};
    for (const j of jobs) {
      const s = sourceName(j);
      by[s] ??= { source: s, roles: 0, contacted: 0, applied: 0, live: 0 };
      by[s].roles += 1;
      if (wasContacted(j)) by[s].contacted += 1;
      if (wasApplied(j)) by[s].applied += 1;
      if (j.status === 'interviewing' || j.status === 'offer') by[s].live += 1;
    }
    return Object.values(by).sort((a, b) => b.roles - a.roles);
  }, [jobs]);

  return (
    <section className="card" aria-labelledby="sources-h">
      <div className="card-head">
        <h2 id="sources-h">Where your roles come from</h2>
        <span className="eyebrow">{rows.length} sources</span>
      </div>
      <div className="tablebox flat">
        <table className="compact">
          <thead>
            <tr>
              <th>Source</th>
              <th className="num">Roles</th>
              <th className="num">Contacted</th>
              <th className="num">Applied</th>
              <th className="num">Interviewing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source}>
                <td>{r.source}</td>
                <td className="num">{r.roles}</td>
                <td className="num">{r.contacted || '—'}</td>
                <td className="num">{r.applied || '—'}</td>
                <td className="num">{r.live || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function InsightsView({ jobs, events, counts, funnel }) {
  return (
    <>
      <PaceCard funnel={funnel} counts={counts} />
      <Insights jobs={jobs} events={events} counts={counts} />
      <SourceTable jobs={jobs} />
    </>
  );
}

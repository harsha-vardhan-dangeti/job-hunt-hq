import { fmtDate, today } from './model';
import { CopyBox, RunAgent } from './parts';

/** Split "LEAD SENTENCE. The rest…" so the lead can stand out. Only short
 *  leads count; a long first sentence stays as body text. */
function splitLead(text) {
  const m = String(text).match(/^(.{4,110}?)(?:([.!?])|\s(—))\s+(.+)$/s);
  if (!m) return ['', String(text)];
  // "LEAD — rest" keeps its dash in the body; "Lead. Rest" keeps its full stop on the lead.
  return m[3] ? [m[1], `— ${m[4]}`] : [m[1] + m[2], m[4]];
}

function Item({ text, n }) {
  const [lead, rest] = splitLead(text);
  return (
    <li className="bitem">
      {n != null ? (
        <span className="bnum" aria-hidden="true">
          {n}
        </span>
      ) : null}
      <p>
        {lead ? <strong>{lead} </strong> : null}
        {rest}
      </p>
    </li>
  );
}

/** The agent's morning brief on its own page, sized for reading. */
export default function BriefView({ brief, agentReady }) {
  const todo = brief.todo || [];
  const inbox = brief.inbox || [];
  const stale = brief.date && brief.date !== today();
  const written = brief.date
    ? new Date(`${brief.date}T00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <>
      <header className="page-head brief-page-head">
        <div>
          <h1>Morning brief</h1>
          <p>{written ? `Written ${written}.` : 'No brief yet.'} The agent rewrites it at 8:30 every weekday.</p>
        </div>
        <RunAgent ready={agentReady} />
      </header>

      {stale ? (
        <div className="banner warn">
          This brief is from {fmtDate(brief.date)}. Today&apos;s run hasn&apos;t written a new one yet.
        </div>
      ) : null}

      <div className="brief-layout">
        <div className="brief-main">
          <section className="card brief-sec" aria-labelledby="todo-h">
            <div className="card-head">
              <h2 id="todo-h">To do</h2>
              <span className="eyebrow">{todo.length} items, most important first</span>
            </div>
            {todo.length ? (
              <ol className="blist">
                {todo.map((t, i) => (
                  <Item key={i} text={t} n={i + 1} />
                ))}
              </ol>
            ) : (
              <p className="muted">Nothing yet. The agent fills this in each weekday morning.</p>
            )}
          </section>

          <section className="card brief-sec" aria-labelledby="inbox-h">
            <div className="card-head">
              <h2 id="inbox-h">From your inbox</h2>
              <span className="eyebrow">Recruiter mail and application updates</span>
            </div>
            {inbox.length ? (
              <ul className="blist plain">
                {inbox.map((t, i) => (
                  <Item key={i} text={t} />
                ))}
              </ul>
            ) : (
              <p className="muted">No mail worth acting on.</p>
            )}
          </section>
        </div>

        <aside className="brief-side">
          <section className="card" aria-labelledby="naukri-h">
            <h2 id="naukri-h">Naukri headline</h2>
            <CopyBox text={brief.naukri} />
          </section>
          <section className="card" aria-labelledby="notes-h">
            <h2 id="notes-h">Market notes</h2>
            <p className="bnotes">{brief.notes || 'Nothing yet.'}</p>
          </section>
        </aside>
      </div>
    </>
  );
}

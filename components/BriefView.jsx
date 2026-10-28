import { fmtDate, today } from './model';
import { CopyBox, RunAgent } from './parts';

/** Split "Lead sentence. The rest…" so the lead can stand out. Only short
 *  leads count; a long first sentence stays as body text. */
function splitLead(text) {
  const m = String(text).match(/^(.{4,110}?)(?:([.!?])|\s(—))\s+(.+)$/s);
  if (!m) return ['', String(text)];
  // "Lead — rest" keeps its dash in the body; "Lead. Rest" keeps its full stop on the lead.
  return m[3] ? [m[1], `— ${m[4]}`] : [m[1] + m[2], m[4]];
}

function Item({ text, n }) {
  const [lead, rest] = splitLead(text);
  return (
    <li className="bitem">
      {n != null ? <span className="bnum">{n}</span> : null}
      <p>
        {lead ? <strong>{lead} </strong> : null}
        {rest}
      </p>
    </li>
  );
}

/** The agent's morning brief on its own page, laid out for reading rather than scanning. */
export default function BriefView({ brief, agentReady }) {
  const todo = brief.todo || [];
  const inbox = brief.inbox || [];
  const stale = brief.date && brief.date !== today();
  const written = brief.date
    ? new Date(`${brief.date}T00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <article className="brief-doc">
      <header className="brief-masthead">
        <div>
          <h1>Morning brief</h1>
          <p>{written ? `Written ${written}` : 'No brief yet'}</p>
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
          <section aria-labelledby="todo-h">
            <h2 id="todo-h">To do, most important first</h2>
            {todo.length ? (
              <ol className="blist">
                {todo.map((t, i) => (
                  <Item key={i} text={t} n={i + 1} />
                ))}
              </ol>
            ) : (
              <p className="muted">Nothing yet. The agent writes this at 8:30 every weekday.</p>
            )}
          </section>

          <section aria-labelledby="inbox-h">
            <h2 id="inbox-h">From your inbox</h2>
            {inbox.length ? (
              <ul className="blist plain">
                {inbox.map((t, i) => (
                  <Item key={i} text={t} />
                ))}
              </ul>
            ) : (
              <p className="muted">No recruiter mail or application updates to act on.</p>
            )}
          </section>
        </div>

        <aside className="brief-side">
          <section aria-labelledby="naukri-h">
            <h2 id="naukri-h">Naukri headline</h2>
            <CopyBox text={brief.naukri} />
          </section>
          <section aria-labelledby="notes-h">
            <h2 id="notes-h">Market notes</h2>
            <p className="bnotes">{brief.notes || 'Nothing yet.'}</p>
          </section>
        </aside>
      </div>
    </article>
  );
}

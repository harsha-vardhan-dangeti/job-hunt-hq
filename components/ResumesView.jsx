import { useMemo, useState } from 'react';
import { fmtDate } from './model';
import { Fit } from './parts';
import { JD_SOURCE, factCheck, resumeState, resumeText, wantsResume } from './resume';

const STATE_TEXT = {
  ready: 'Tailored',
  stale: 'Master changed since',
  requested: 'Being written…',
  stalled: "Didn't finish",
  none: 'Not tailored yet',
};

/** The master resume: pasted once, edited when something real changes. */
function MasterCard({ master, setMaster, readOnly }) {
  const empty = !master.text?.trim();
  const [editing, setEditing] = useState(empty);
  const [text, setText] = useState(master.text || '');
  const [state, setState] = useState({ busy: false, msg: '', error: false });
  const words = (master.text || '').split(/\s+/).filter(Boolean).length;

  async function save() {
    setState({ busy: true, msg: '', error: false });
    try {
      const res = await fetch('/api/resume', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
      setMaster(body.resume);
      setEditing(false);
      setState({ busy: false, msg: 'Master resume saved', error: false });
    } catch (e) {
      setState({ busy: false, msg: e.message, error: true });
    }
  }

  return (
    <section className="card master" aria-labelledby="master-h">
      <div className="card-head">
        <div>
          <h2 id="master-h">Master resume</h2>
          <p className="muted small">
            {empty
              ? 'Not added yet.'
              : `Updated ${fmtDate(master.updatedOn)} · ${words} words. The only source of facts for every tailored resume.`}
          </p>
        </div>
        {!editing ? (
          <button className="ghost" onClick={() => setEditing(true)} disabled={readOnly}>
            Edit master resume
          </button>
        ) : null}
      </div>
      {editing ? (
        <>
          <p className="master-help">
            Paste your full, current resume as text: every job, project, number, tool and certificate you can back up in
            an interview. The agent tailors each resume from this alone. It can reorder, choose and reword what&apos;s
            here, but never add an employer, title, date, figure or skill that isn&apos;t.
          </p>
          <textarea
            className="master-text"
            aria-label="Master resume"
            placeholder={
              'Your name\nemail · phone · city · LinkedIn\n\nSUMMARY\n…\n\nEXPERIENCE\nSoftware Engineer, Qualcomm, Hyderabad | 2022 – present\n- …'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row-actions">
            <button className="primary" onClick={save} disabled={readOnly || state.busy || !text.trim()}>
              {state.busy ? 'Saving…' : 'Save master resume'}
            </button>
            {!empty ? (
              <button
                className="ghost"
                onClick={() => {
                  setText(master.text || '');
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            ) : null}
            {state.msg ? <span className={`saved${state.error ? ' err' : ''}`}>{state.msg}</span> : null}
          </div>
        </>
      ) : state.msg ? (
        <span className="saved">{state.msg}</span>
      ) : null}
    </section>
  );
}

function RoleRow({ j, st, selected, onSelect }) {
  return (
    <li>
      <button className={`rrow${selected ? ' on' : ''}`} onClick={() => onSelect(j.id)} aria-pressed={selected}>
        <span className="rrow-who">
          <b>{j.company}</b>
          <span className="muted">{j.role || 'Role to pick'}</span>
        </span>
        <span className="rrow-meta">
          <Fit n={j.fit} />
          <span className={`rstate r-${st}`}>{STATE_TEXT[st]}</span>
        </span>
      </button>
    </li>
  );
}

function Doc({ r }) {
  return (
    <article className="resume-doc" aria-label="Tailored resume">
      <header>
        {r.name ? <h2 className="rd-name">{r.name}</h2> : null}
        {r.contact ? <p className="rd-contact">{r.contact}</p> : null}
        {r.headline ? <p className="rd-headline">{r.headline}</p> : null}
      </header>
      {r.summary ? (
        <section>
          <h3>Summary</h3>
          <p>{r.summary}</p>
        </section>
      ) : null}
      {r.skills?.length ? (
        <section>
          <h3>Skills</h3>
          <ul className="rd-skills">
            {r.skills.map((g, i) => (
              <li key={i}>
                <b>{g.group}:</b> {(g.items || []).join(', ')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.experience?.length ? (
        <section>
          <h3>Experience</h3>
          {r.experience.map((x, i) => (
            <div className="rd-job" key={i}>
              <div className="rd-jobline">
                <b>
                  {x.title}
                  {x.company ? `, ${x.company}` : ''}
                </b>
                <span>{[x.location, x.dates].filter(Boolean).join(' | ')}</span>
              </div>
              <ul>
                {(x.bullets || []).map((b, k) => (
                  <li key={k}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      {r.projects?.length ? (
        <section>
          <h3>Projects</h3>
          {r.projects.map((p, i) => (
            <div className="rd-job" key={i}>
              <b>{p.name}</b>
              <ul>
                {(p.bullets || []).map((b, k) => (
                  <li key={k}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      {r.education?.length ? (
        <section>
          <h3>Education</h3>
          {r.education.map((e, i) => (
            <div className="rd-jobline" key={i}>
              <b>{[e.degree, e.school].filter(Boolean).join(', ')}</b>
              <span>{e.dates}</span>
            </div>
          ))}
        </section>
      ) : null}
      {r.certifications?.length ? (
        <section>
          <h3>Certifications</h3>
          <ul>
            {r.certifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function Viewer({ j, master, tailor, openRole, readOnly, agentReady }) {
  const [copied, setCopied] = useState('');
  const r = j.resume;
  const st = resumeState(j, master);
  const unverified = useMemo(() => factCheck(r, master.text), [r, master.text]);
  const canTailor = agentReady && !readOnly && Boolean(master.text?.trim()) && st !== 'requested';

  function download() {
    const root = document.documentElement;
    const title = document.title;
    // The saved PDF takes its file name from the page title.
    document.title = [r.name, j.company, j.role].filter(Boolean).join(' - ');
    root.classList.add('print-resume');
    window.addEventListener(
      'afterprint',
      () => {
        root.classList.remove('print-resume');
        document.title = title;
      },
      { once: true },
    );
    window.print();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(resumeText(r));
      setCopied('Copied');
    } catch {
      setCopied('Copy failed');
    }
    setTimeout(() => setCopied(''), 2000);
  }

  const tailorBtn = (
    <button
      className={r ? 'ghost' : 'primary'}
      onClick={() => tailor(j)}
      disabled={!canTailor}
      title={
        !master.text?.trim() ? 'Add your master resume first' : !agentReady ? 'Connect the agent first' : undefined
      }
    >
      {st === 'requested' ? 'Being written…' : r ? 'Tailor again' : 'Tailor resume'}
    </button>
  );

  return (
    <section className="viewer" aria-labelledby="viewer-h">
      <div className="card viewer-head">
        <div>
          <h2 id="viewer-h">
            {j.company} <span className="muted">· {j.role || 'Role to pick'}</span>
          </h2>
          <p className="muted small">
            {r
              ? `Tailored ${fmtDate(r.generatedOn)} from ${JD_SOURCE[r.jdSource] || 'the role'}.`
              : 'No tailored resume yet.'}
            {st === 'stale' ? ' Your master resume changed after this was written, so tailor it again.' : ''}
            {st === 'requested' ? ' The agent is writing it now; reload in a few minutes.' : ''}
            {st === 'stalled' ? " The last request didn't finish. Try again." : ''}
          </p>
        </div>
        <div className="row-actions">
          {r ? (
            <>
              <button className="primary" onClick={download}>
                Download PDF
              </button>
              <button className="ghost" onClick={copy}>
                {copied || 'Copy as text'}
              </button>
            </>
          ) : null}
          {tailorBtn}
          <button className="ghost" onClick={() => openRole(j.id)}>
            Open role
          </button>
        </div>
      </div>

      {r ? (
        <>
          {!master.text?.trim() ? (
            <div className="card check warn">
              <h3>Can&apos;t check facts yet</h3>
              <p className="small">Add your master resume above, and every item here is checked against it.</p>
            </div>
          ) : (
            <div className={`card check ${unverified.length ? 'warn' : 'ok'}`}>
              <h3>{unverified.length ? 'Check these before you send it' : 'Every fact checks out'}</h3>
              {unverified.length ? (
                <>
                  <p className="small">
                    These aren&apos;t in your master resume. Remove them, or add them to the master if they&apos;re
                    true.
                  </p>
                  <div className="chips">
                    {unverified.map((u) => (
                      <span key={u} className="kchip bad">
                        {u}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="small">Every employer, title, skill and number here appears in your master resume.</p>
              )}
            </div>
          )}

          <div className="match-grid">
            <div className="card">
              <h3>What the role asks for that you have</h3>
              <div className="chips">
                {(r.match?.covered || []).length ? (
                  r.match.covered.map((k) => (
                    <span key={k} className="kchip ok">
                      {k}
                    </span>
                  ))
                ) : (
                  <span className="muted small">None listed.</span>
                )}
              </div>
            </div>
            <div className="card">
              <h3>Gaps, left out on purpose</h3>
              <div className="chips">
                {(r.match?.gaps || []).length ? (
                  r.match.gaps.map((k) => (
                    <span key={k} className="kchip warn">
                      {k}
                    </span>
                  ))
                ) : (
                  <span className="muted small">No gaps found.</span>
                )}
              </div>
              {(r.match?.gaps || []).length ? (
                <p className="muted small">
                  Your resume doesn&apos;t show these, so they aren&apos;t claimed. Speak to them honestly if asked.
                </p>
              ) : null}
            </div>
          </div>

          {r.changes?.length ? (
            <details className="card changes">
              <summary>What was tailored for this role ({r.changes.length})</summary>
              <ul>
                {r.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <Doc r={r} />
        </>
      ) : (
        <div className="card empty-state">
          <h3>Nothing here yet</h3>
          <p className="muted">
            {master.text?.trim()
              ? 'Tailor resume asks the agent to write one for this role. It takes a few minutes.'
              : 'Add your master resume above first. Every tailored resume is built from it.'}
          </p>
        </div>
      )}
    </section>
  );
}

export default function ResumesView({
  jobs,
  master,
  setMaster,
  selectedId,
  setSelectedId,
  tailor,
  openRole,
  readOnly,
  agentReady,
}) {
  const groups = useMemo(() => {
    const withState = jobs.map((j) => ({ j, st: resumeState(j, master) }));
    const byFit = (a, b) => (Number(b.j.fit) || 0) - (Number(a.j.fit) || 0) || a.j.company.localeCompare(b.j.company);
    return {
      working: withState.filter((x) => x.st === 'requested' || x.st === 'stalled').sort(byFit),
      done: withState
        .filter((x) => x.st === 'ready' || x.st === 'stale')
        .sort((a, b) => String(b.j.resume.generatedOn).localeCompare(String(a.j.resume.generatedOn))),
      todo: withState.filter((x) => x.st === 'none' && wantsResume(x.j)).sort(byFit),
    };
  }, [jobs, master]);

  const pick =
    jobs.find((j) => j.id === selectedId) || groups.done[0]?.j || groups.working[0]?.j || groups.todo[0]?.j || null;

  const list = (title, items, note) =>
    items.length ? (
      <div className="rgroup">
        <h3>
          {title} <span className="muted">{items.length}</span>
        </h3>
        {note ? <p className="muted small">{note}</p> : null}
        <ul>
          {items.map(({ j, st }) => (
            <RoleRow key={j.id} j={j} st={st} selected={pick?.id === j.id} onSelect={setSelectedId} />
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <header className="page-head">
        <h1>Resumes</h1>
        <p>
          A resume for each role, built only from your master resume: the matching experience goes first, in the
          role&apos;s own words, so it clears HR and applicant-tracking filters. Nothing is invented.
        </p>
      </header>

      <MasterCard master={master} setMaster={setMaster} readOnly={readOnly} />

      <div className="resume-layout">
        <nav className="card rlist" aria-label="Roles">
          {list('Being written', groups.working)}
          {list('Tailored', groups.done)}
          {list(
            'Ready to tailor',
            groups.todo,
            'Open roles at fit 4 or 5. The agent tailors up to three each morning.',
          )}
          {!groups.working.length && !groups.done.length && !groups.todo.length ? (
            <p className="muted">No open fit-4+ roles yet.</p>
          ) : null}
        </nav>
        {pick ? (
          <Viewer
            key={pick.id}
            j={pick}
            master={master}
            tailor={tailor}
            openRole={openRole}
            readOnly={readOnly}
            agentReady={agentReady}
          />
        ) : null}
      </div>
    </>
  );
}

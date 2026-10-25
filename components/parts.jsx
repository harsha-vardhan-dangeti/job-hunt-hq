import { useState } from 'react';

/** Fit as five dots, filled to the score. */
export function Fit({ n }) {
  return (
    <span className="fit" title={`Fit ${n || 0} of 5`} aria-label={`Fit ${n || 0} of 5`}>
      {'●'.repeat(n || 0)}
      {'○'.repeat(Math.max(0, 5 - (n || 0)))}
    </span>
  );
}

export function RunAgent({ ready }) {
  const [state, setState] = useState({ busy: false, started: false, url: null, error: '' });

  async function run() {
    if (
      !window.confirm(
        'Run the job-hunt agent now?\n\nIt syncs Gmail, adds new roles, writes drafts and rewrites today\'s brief. A run takes about 10 minutes; reload the page afterwards to see the results.'
      )
    )
      return;
    setState({ busy: true, started: false, url: null, error: '' });
    try {
      const res = await fetch('/api/agent/run', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Couldn't start the agent (${res.status})`);
      setState({ busy: false, started: true, url: body.sessionUrl, error: '' });
    } catch (e) {
      setState({ busy: false, started: false, url: null, error: e.message });
    }
  }

  if (state.started) {
    return (
      <span className="agent-status">
        Agent started
        {state.url ? (
          <>
            {' · '}
            <a href={state.url} target="_blank" rel="noopener noreferrer">
              Watch the run ↗
            </a>
          </>
        ) : null}
      </span>
    );
  }
  return (
    <span className="agent-run">
      <button
        className="ghost"
        onClick={run}
        disabled={!ready || state.busy}
        title={ready ? 'Start the scheduled agent now' : 'Connect the agent first: see the README'}
      >
        {state.busy ? 'Starting…' : 'Run agent now'}
      </button>
      {state.error ? <span className="saved err">{state.error}</span> : null}
      {!ready ? <span className="muted small">Agent not connected</span> : null}
    </span>
  );
}

export function CopyBox({ text }) {
  const [state, setState] = useState('');
  if (!text) return <div className="naukri">—</div>;
  return (
    <>
      <div className="naukri">{text}</div>
      <button
        className="ghost"
        style={{ justifySelf: 'start' }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState('Copied');
          } catch {
            setState('Select it and press Ctrl/Cmd+C');
          }
          setTimeout(() => setState(''), 2500);
        }}
      >
        {state || 'Copy headline'}
      </button>
    </>
  );
}


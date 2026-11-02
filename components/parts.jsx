import { useState } from 'react';
import { startAgent } from './AgentRun';

/** Fit as five dots, filled to the score. */
export function Fit({ n }) {
  return (
    <span className="fit" title={`Fit ${n || 0} of 5`} aria-label={`Fit ${n || 0} of 5`}>
      {'●'.repeat(n || 0)}
      {'○'.repeat(Math.max(0, 5 - (n || 0)))}
    </span>
  );
}

/** Starts the morning routine now. While a run is live it waits; the run's
 *  steps show below it as the agent reports them. */
export function RunAgent({ ready, busy: running }) {
  const [state, setState] = useState({ busy: false, error: '' });

  async function run() {
    if (
      !window.confirm(
        "Run the job-hunt agent now?\n\nIt syncs Gmail, adds new roles, writes drafts and rewrites today's brief. A run takes 10 to 20 minutes, and you can watch each step on this page."
      )
    )
      return;
    setState({ busy: true, error: '' });
    try {
      await startAgent();
      setState({ busy: false, error: '' });
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }

  return (
    <span className="agent-run">
      <button
        className="ghost"
        onClick={run}
        disabled={!ready || state.busy || running}
        title={ready ? 'Start the scheduled agent now' : 'Connect the agent first: see the README'}
      >
        {state.busy ? 'Starting…' : running ? 'Agent running…' : 'Run agent now'}
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


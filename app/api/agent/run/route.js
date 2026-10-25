import { canWrite, unauthorized } from '../../../../lib/auth';
import { agentReady } from '../../../../lib/agent';

export const dynamic = 'force-dynamic';

/** Starts the scheduled job-hunt agent (a Claude Code routine) right now through
 *  its API trigger. The token stays on the server; the browser only gets back
 *  the link to watch the run. */
export async function POST(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!agentReady) {
    return Response.json(
      { error: 'Agent not connected. Set AGENT_ROUTINE_ID and AGENT_ROUTINE_TOKEN in Vercel.' },
      { status: 409 }
    );
  }
  try {
    const res = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${process.env.AGENT_ROUTINE_ID}/fire`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AGENT_ROUTINE_TOKEN}`,
          'anthropic-beta': 'experimental-cc-routine-2026-04-01',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Started on demand from the Job Hunt HQ "Run agent now" button.' }),
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body.error?.message || body.message || `HTTP ${res.status}`;
      return Response.json({ error: `The agent didn't start: ${reason}` }, { status: 502 });
    }
    return Response.json({ sessionUrl: body.claude_code_session_url || null });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

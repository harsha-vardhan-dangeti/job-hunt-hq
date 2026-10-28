import { canWrite, unauthorized } from '../../../../lib/auth';
import { agentReady } from '../../../../lib/agent';
import { upsertJob, hasDb } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

const JOB_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;

/** Starts the scheduled job-hunt agent (a Claude Code routine) right now through
 *  its API trigger. The token stays on the server; the browser only gets back
 *  the link to watch the run.
 *
 *  Body (optional): {jobId} — instead of the full morning routine, the agent
 *  only tailors the resume for that role. The routine's prompt recognises the
 *  "TAILOR RESUME: <id>" line. */
export async function POST(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!agentReady) {
    return Response.json(
      { error: 'Agent not connected. Set AGENT_ROUTINE_ID and AGENT_ROUTINE_TOKEN in Vercel.' },
      { status: 409 }
    );
  }
  const { jobId } = await request.json().catch(() => ({}));
  if (jobId !== undefined && !JOB_ID.test(String(jobId))) {
    return Response.json({ error: 'Unknown role id.' }, { status: 400 });
  }
  const text = jobId
    ? `TAILOR RESUME: ${jobId}`
    : 'Started on demand from the Job Hunt HQ "Run agent now" button.';

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
        body: JSON.stringify({ text }),
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body.error?.message || body.message || `HTTP ${res.status}`;
      return Response.json({ error: `The agent didn't start: ${reason}` }, { status: 502 });
    }
    // Mark the role so the page can show the resume as on its way; the agent
    // clears the mark when it writes the resume.
    let requestedAt = null;
    if (jobId && hasDb) {
      requestedAt = new Date().toISOString();
      await upsertJob(jobId, { resumeRequestedOn: requestedAt }).catch(() => {
        requestedAt = null;
      });
    }
    return Response.json({ sessionUrl: body.claude_code_session_url || null, requestedAt });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

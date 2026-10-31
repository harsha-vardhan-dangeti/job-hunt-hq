import { listJobs, getResume } from '../../../lib/db';
import { canRead, unauthorized } from '../../../lib/auth';
import { ATS_TARGET } from '../../../components/ats';
import { atsFor } from '../../../components/resume';

export const dynamic = 'force-dynamic';

/** Scores a resume for one role, with the same code the Resumes page uses, so
 *  the agent can revise a draft until it reaches the target. Nothing is saved.
 *
 *  Body: {jobId, resume?, jd?}. `resume` is a draft resume object (defaults to
 *  the saved one); `jd` overrides the row's job description, for a draft
 *  whose description the agent hasn't saved yet. */
export async function POST(request) {
  if (!(await canRead(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body?.jobId) return Response.json({ error: 'Send {"jobId": "...", "resume": {...}}.' }, { status: 400 });
  try {
    const [jobs, master] = await Promise.all([listJobs(), getResume()]);
    const job = jobs.find((j) => j.id === body.jobId);
    if (!job) return Response.json({ error: 'Unknown role id.' }, { status: 404 });
    if (!master.text?.trim()) return Response.json({ error: 'The master resume is empty.' }, { status: 409 });
    const j = typeof body.jd === 'string' && body.jd.trim() ? { ...job, jd: body.jd } : job;
    if (!j.jd?.trim()) {
      return Response.json({ error: 'This role has no job description. Send "jd" or save it on the row.' }, { status: 409 });
    }
    const r = body.resume && typeof body.resume === 'object' ? body.resume : job.resume;
    const { tailored, master: base } = atsFor(j, master.text, r);
    if (!base) {
      return Response.json(
        { error: 'The job description names none of the skills the scorer knows, so it cannot be scored.' },
        { status: 422 }
      );
    }
    return Response.json({ target: ATS_TARGET, tailored, master: base });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

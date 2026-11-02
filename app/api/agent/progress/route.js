import { canRead, canWrite, unauthorized } from '../../../../lib/auth';
import { getRuns, updateRuns } from '../../../../lib/db';
import { applyReport, badReport } from '../../../../components/runs';

export const dynamic = 'force-dynamic';

/** Recent agent runs, newest first, for the page to show live. */
export async function GET(request) {
  if (!(await canRead(request))) return unauthorized();
  try {
    return Response.json({ runs: await getRuns() });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

/** The agent reports a step as it works:
 *    {"kind":"morning","step":"tracker","status":"done","detail":"74 roles"}   first report
 *    {"step":"gmail","status":"running"}
 *    {"step":"gmail","status":"done","detail":"2 status changes"}
 *    {"step":"finish","status":"done","detail":"<summary>"}                     last report
 *  status is running, done, skipped or failed; detail is one short line. */
export async function POST(request) {
  if (!(await canWrite(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const bad = badReport(body);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  try {
    const runs = await updateRuns((list) => applyReport(list, body));
    const { id, status, steps } = runs[0];
    return Response.json({ run: { id, status, steps: steps.length } });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

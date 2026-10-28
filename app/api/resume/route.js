import { getResume, putResume, hasDb } from '../../../lib/db';
import { canRead, canWrite, unauthorized } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

/** The master resume. The agent reads it before tailoring a resume to a role. */
export async function GET(request) {
  if (!(await canRead(request))) return unauthorized();
  try {
    return Response.json({ resume: await getResume() });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

/** Replace the master resume. Body: {text}. */
export async function PUT(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) {
    return Response.json(
      { error: 'No database configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable writes.' },
      { status: 409 }
    );
  }
  try {
    const body = await request.json();
    if (typeof body?.text !== 'string') {
      return Response.json({ error: 'Send {"text": "..."}.' }, { status: 400 });
    }
    return Response.json({ resume: await putResume(body.text) });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

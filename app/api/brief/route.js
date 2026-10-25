import { getBrief, putBrief, hasDb } from '../../../lib/db';
import { canWrite, unauthorized } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ brief: await getBrief(), readOnly: !hasDb });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

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
    return Response.json({ brief: await putBrief(body) });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

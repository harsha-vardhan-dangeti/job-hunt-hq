import { upsertJob, deleteJob, hasDb } from '../../../../lib/db';
import { canWrite, unauthorized } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

function noDb() {
  return Response.json(
    { error: 'No database configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable writes.' },
    { status: 409 }
  );
}

export async function PATCH(request, { params }) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) return noDb();
  try {
    const { id } = await params;
    const patch = await request.json();
    const saved = await upsertJob(id, patch);
    return Response.json({ saved });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) return noDb();
  try {
    const { id } = await params;
    const body = await request.json();
    const saved = await upsertJob(id, body, { replace: true });
    return Response.json({ saved });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) return noDb();
  try {
    const { id } = await params;
    await deleteJob(id);
    return Response.json({ deleted: id });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

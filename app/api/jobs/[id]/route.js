import { upsertJob, deleteJob, listJobEvents, hasDb } from '../../../../lib/db';
import { canRead, canWrite, unauthorized } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

function noDb() {
  return Response.json(
    { error: 'No database configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable writes.' },
    { status: 409 }
  );
}

/** One role's logged history, for the timeline in its panel. */
export async function GET(request, { params }) {
  if (!(await canRead(request))) return unauthorized();
  try {
    const { id } = await params;
    return Response.json({ events: await listJobEvents(id) });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
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

import { listJobs, upsertJob, hasDb } from '../../../lib/db';
import { canRead, canWrite, unauthorized } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!(await canRead(request))) return unauthorized();
  try {
    const jobs = await listJobs();
    return Response.json({ jobs, readOnly: !hasDb });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function POST(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) {
    return Response.json(
      { error: 'No database configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable writes.' },
      { status: 409 }
    );
  }
  try {
    const body = await request.json();
    const rows = Array.isArray(body) ? body : [body];
    const saved = [];
    for (const row of rows) {
      const id =
        row.id ||
        [slugify(row.company), slugify(row.role)].filter(Boolean).join('-') ||
        `row-${Date.now()}`;
      const { id: _drop, ...rest } = row;
      saved.push(
        await upsertJob(id, {
          status: 'wishlist',
          fit: 3,
          addedOn: new Date().toISOString().slice(0, 10),
          ...rest,
        })
      );
    }
    return Response.json({ saved });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

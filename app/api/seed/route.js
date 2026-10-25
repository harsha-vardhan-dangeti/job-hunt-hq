import { importSeed, hasDb } from '../../../lib/db';
import { canWrite, unauthorized } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

/** One-time import of the exported rows into the database. Safe to re-run:
 *  existing ids are left untouched. */
export async function POST(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) {
    return Response.json({ error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.' }, { status: 409 });
  }
  try {
    const n = await importSeed();
    return Response.json({ imported: n });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

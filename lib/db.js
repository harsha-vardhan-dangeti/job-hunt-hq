import fs from 'node:fs';
import path from 'node:path';
import { supabase, hasSupabase } from './supabase';

export const hasDb = hasSupabase;

/** Unwrap a supabase-js result, throwing on error. */
function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/* ---------- seed fallback (no database configured) ---------- */

function readSeed(name) {
  try {
    const p = path.join(process.cwd(), 'seed', `${name}.json`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return name === 'jobs' ? [] : {};
  }
}

export function seedJobs() {
  return readSeed('jobs');
}
export function seedBrief() {
  return readSeed('brief');
}

/* ---------- reads ---------- */

export async function listJobs() {
  if (!hasDb) return seedJobs();
  const rows = must(
    await supabase().from('jobs').select('id, data, updated_at').order('id', { ascending: true })
  );
  return rows.map((r) => ({ ...r.data, id: r.id, _updatedAt: r.updated_at }));
}

export async function getBrief() {
  if (!hasDb) return seedBrief();
  const row = must(await supabase().from('brief').select('data').eq('id', 'today').maybeSingle());
  return row?.data ?? {};
}

export async function listEvents(days = 90) {
  if (!hasDb) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return must(
    await supabase()
      .from('events')
      .select('job_id, company, field, old_val, new_val, at')
      .gt('at', since)
      .order('at', { ascending: false })
      .limit(500)
  );
}

/** Every logged change to one role, newest first, for its timeline. */
export async function listJobEvents(id) {
  if (!hasDb) return [];
  return must(
    await supabase()
      .from('events')
      .select('job_id, company, field, old_val, new_val, at')
      .eq('job_id', id)
      .order('at', { ascending: false })
      .limit(200)
  );
}

/* ---------- writes ----------
   The merge and the activity log both happen inside Postgres (merge_job() and
   the jobs_log_events trigger), so a write is one round trip and is logged no
   matter where it came from. */

export async function upsertJob(id, patch, { replace = false } = {}) {
  return must(
    await supabase().rpc('merge_job', { p_id: id, p_patch: patch, p_replace: replace })
  );
}

export async function deleteJob(id) {
  must(await supabase().from('jobs').delete().eq('id', id));
}

export async function putBrief(data) {
  const next = { ...data, updatedOn: new Date().toISOString().slice(0, 10) };
  must(await supabase().from('brief').upsert({ id: 'today', data: next }));
  return next;
}

export async function importSeed() {
  return must(
    await supabase().rpc('import_seed', { p_jobs: seedJobs(), p_brief: seedBrief() })
  );
}

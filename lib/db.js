import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const CONN =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  '';

export const hasDb = Boolean(CONN);

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: CONN,
      ssl: CONN.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          text PRIMARY KEY,
      data        jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS brief (
      id          text PRIMARY KEY,
      data        jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS events (
      id       bigserial PRIMARY KEY,
      job_id   text NOT NULL,
      company  text,
      field    text NOT NULL,
      old_val  text,
      new_val  text,
      at       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS events_at_idx ON events (at DESC);
  `);
  schemaReady = true;
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
  await ensureSchema();
  const { rows } = await query(
    'SELECT id, data, updated_at FROM jobs ORDER BY id ASC'
  );
  if (rows.length === 0) return [];
  return rows.map((r) => ({ ...r.data, id: r.id, _updatedAt: r.updated_at }));
}

export async function getBrief() {
  if (!hasDb) return seedBrief();
  await ensureSchema();
  const { rows } = await query("SELECT data FROM brief WHERE id = 'today'");
  return rows[0]?.data ?? {};
}

export async function listEvents(days = 90) {
  if (!hasDb) return [];
  await ensureSchema();
  const { rows } = await query(
    `SELECT job_id, company, field, old_val, new_val, at
       FROM events
      WHERE at > now() - ($1 || ' days')::interval
      ORDER BY at DESC
      LIMIT 500`,
    [String(days)]
  );
  return rows;
}

/* ---------- writes ---------- */

const TRACKED = ['status', 'interviewAt', 'deadline', 'messagedOn'];

export async function upsertJob(id, patch, { replace = false } = {}) {
  await ensureSchema();
  const { rows } = await query('SELECT data FROM jobs WHERE id = $1', [id]);
  const before = rows[0]?.data ?? null;

  const next = replace ? { ...patch } : { ...(before ?? {}), ...patch };
  delete next.id;
  delete next._updatedAt;
  next.updatedOn = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO jobs (id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = now()`,
    [id, JSON.stringify(next)]
  );

  const changes = [];
  if (before) {
    for (const field of TRACKED) {
      const oldVal = before[field] ?? null;
      const newVal = next[field] ?? null;
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changes.push([id, next.company ?? before.company ?? '', field, oldVal, newVal]);
      }
    }
  } else {
    changes.push([id, next.company ?? '', 'created', null, next.status ?? 'wishlist']);
  }

  for (const c of changes) {
    await query(
      'INSERT INTO events (job_id, company, field, old_val, new_val) VALUES ($1,$2,$3,$4,$5)',
      c
    );
  }

  return { ...next, id };
}

export async function deleteJob(id) {
  await ensureSchema();
  await query('DELETE FROM jobs WHERE id = $1', [id]);
}

export async function putBrief(data) {
  await ensureSchema();
  const next = { ...data, updatedOn: new Date().toISOString().slice(0, 10) };
  await query(
    `INSERT INTO brief (id, data) VALUES ('today', $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
    [JSON.stringify(next)]
  );
  return next;
}

export async function importSeed() {
  await ensureSchema();
  const jobs = seedJobs();
  let n = 0;
  for (const job of jobs) {
    const { id, ...rest } = job;
    if (!id) continue;
    await query(
      `INSERT INTO jobs (id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(rest)]
    );
    n += 1;
  }
  const brief = seedBrief();
  if (brief && Object.keys(brief).length) {
    await query(
      `INSERT INTO brief (id, data) VALUES ('today', $1::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(brief)]
    );
  }
  return n;
}

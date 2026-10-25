import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Vercel's Supabase integration sets SUPABASE_URL and SUPABASE_SECRET_KEY.
// SUPABASE_SERVICE_ROLE_KEY is the legacy name for the same secret key.
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const hasSupabase = Boolean(URL && KEY);

let client;

/** Server-only client. The secret key bypasses RLS, so it must never reach the
 *  browser: every caller sits behind the auth checks in lib/auth.js. */
export function supabase() {
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

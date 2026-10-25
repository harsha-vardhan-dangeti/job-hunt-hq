import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './gate';

/** Supabase Auth client bound to this request's cookies. It uses the
 *  publishable key: it only handles sign-in, never data, which goes through
 *  lib/supabase.js on the server. */
export async function authClient() {
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a Server Component, which can't set cookies; proxy.js
          // refreshes the session on the next page load instead.
        }
      },
    },
  });
}

/** The signed-in Google email, read from the verified session token, or null. */
export async function sessionEmail() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const { data } = await (await authClient()).auth.getClaims();
    return data?.claims?.email ?? null;
  } catch {
    return null;
  }
}

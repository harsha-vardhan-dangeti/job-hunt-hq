// Who may open the site. Shared by proxy.js and the server routes, so it stays
// free of next/headers and server-only imports.

export const SESSION_COOKIE = 'jhhq_session';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

/** Google accounts allowed in, from ALLOWED_EMAILS (comma-separated). */
export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const isAllowedEmail = (email) => Boolean(email) && allowedEmails().includes(String(email).toLowerCase());

export const googleEnabled = () => Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && allowedEmails().length);
export const passwordEnabled = () => Boolean(process.env.APP_PASSWORD);

/** With neither Google nor a password configured, the site is open. */
export const gateConfigured = () => googleEnabled() || passwordEnabled();

export function timingSafeEqual(a = '', b = '') {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const passwordMatches = (sent) => passwordEnabled() && timingSafeEqual(sent || '', process.env.APP_PASSWORD);

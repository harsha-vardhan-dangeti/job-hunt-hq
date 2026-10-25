import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'jhhq_session';

function timingSafeEqual(a = '', b = '') {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** The agent (scheduled task) authenticates with a bearer token. */
export function isAgent(request) {
  const token = process.env.AGENT_TOKEN;
  if (!token) return false;
  const header = request.headers.get('authorization') || '';
  const sent = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return sent.length > 0 && timingSafeEqual(sent, token);
}

/** A browser session set by the password gate. */
export async function isSignedIn() {
  const password = process.env.APP_PASSWORD;
  if (!password) return true; // no gate configured
  const jar = await cookies();
  return timingSafeEqual(jar.get(SESSION_COOKIE)?.value || '', password);
}

/** Writes are allowed for the agent or a signed-in browser. */
export async function canWrite(request) {
  if (isAgent(request)) return true;
  if (!process.env.APP_PASSWORD) return true;
  return isSignedIn();
}

/** Reads need the same: proxy.js skips /api/*, so each route checks for itself. */
export const canRead = canWrite;

export function unauthorized(message = 'Unauthorized') {
  return Response.json({ error: message }, { status: 401 });
}

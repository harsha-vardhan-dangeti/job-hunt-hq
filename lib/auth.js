import { cookies } from 'next/headers';
import { SESSION_COOKIE, gateConfigured, isAllowedEmail, passwordMatches, timingSafeEqual } from './gate';
import { sessionEmail } from './session';

export { SESSION_COOKIE };

/** The agent (scheduled task) authenticates with a bearer token. */
export function isAgent(request) {
  const token = process.env.AGENT_TOKEN;
  if (!token) return false;
  const header = request.headers.get('authorization') || '';
  const sent = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return sent.length > 0 && timingSafeEqual(sent, token);
}

/** A browser signed in with an allowed Google account, or with the password. */
export async function isSignedIn() {
  if (!gateConfigured()) return true; // no gate configured
  const jar = await cookies();
  if (passwordMatches(jar.get(SESSION_COOKIE)?.value)) return true;
  return isAllowedEmail(await sessionEmail());
}

/** Writes are allowed for the agent or a signed-in browser. */
export async function canWrite(request) {
  if (isAgent(request)) return true;
  return isSignedIn();
}

/** Reads need the same: proxy.js skips /api/*, so each route checks for itself. */
export const canRead = canWrite;

export function unauthorized(message = 'Unauthorized') {
  return Response.json({ error: message }, { status: 401 });
}

import { SESSION_COOKIE, passwordEnabled } from '../../../lib/gate';
import { authClient } from '../../../lib/session';

export const dynamic = 'force-dynamic';

/** Password sign-in, kept as a fallback while APP_PASSWORD is set. */
export async function POST(request) {
  const password = process.env.APP_PASSWORD;
  const { password: sent } = await request.json().catch(() => ({}));

  if (!passwordEnabled()) {
    return Response.json({ error: 'Password sign-in is turned off. Use Google.' }, { status: 400 });
  }
  if (sent !== password) {
    return Response.json({ error: "That password doesn't match." }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  return res;
}

/** Signs out of both: the Google session and the password cookie. */
export async function DELETE() {
  try {
    await (await authClient()).auth.signOut();
  } catch {
    /* no Google session to end */
  }
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}

import { SESSION_COOKIE } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const password = process.env.APP_PASSWORD;
  const { password: sent } = await request.json().catch(() => ({}));

  if (!password) return Response.json({ ok: true });
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

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return res;
}

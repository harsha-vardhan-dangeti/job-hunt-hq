import { NextResponse } from 'next/server';
import { isAllowedEmail } from '../../../lib/gate';
import { authClient } from '../../../lib/session';

export const dynamic = 'force-dynamic';

/** Google sends the browser back here with a one-time code. Swap it for a
 *  session, then let the person in only if their account is on the list. */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  let next = searchParams.get('next') || '/';
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';

  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);

  if (!isAllowedEmail(data?.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

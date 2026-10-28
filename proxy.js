import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  gateConfigured,
  googleEnabled,
  isAllowedEmail,
  passwordMatches,
} from './lib/gate';

export const config = {
  matcher: ['/((?!api|auth|_next/static|_next/image|login|favicon.ico|icon.svg).*)'],
};

/** Keeps the Google session fresh and sends anyone not signed in to /login. */
export default async function proxy(request) {
  if (!gateConfigured()) return NextResponse.next();

  let response = NextResponse.next({ request });
  let email = null;

  if (googleEnabled()) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list, headers) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers || {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    // getClaims verifies the token (refreshing it if needed); never trust getSession here.
    const { data } = await supabase.auth.getClaims();
    email = data?.claims?.email ?? null;
  }

  if (isAllowedEmail(email) || passwordMatches(request.cookies.get(SESSION_COOKIE)?.value)) return response;

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', request.nextUrl.pathname);
  if (email) url.searchParams.set('error', 'not_allowed');
  return NextResponse.redirect(url);
}

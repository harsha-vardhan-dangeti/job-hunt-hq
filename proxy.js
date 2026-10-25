import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|login|favicon.ico).*)'],
};

export default function proxy(request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const session = request.cookies.get('jhhq_session')?.value;
  if (session === password) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

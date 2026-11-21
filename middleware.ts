import { NextResponse, type NextRequest } from 'next/server';
import { auth, authEnabled, isAllowedEmail } from '@/auth';

const PUBLIC_PATHS = ['/login', '/api/auth'];

const guarded = auth(req => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (isAllowedEmail(req.auth?.user?.email)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('callbackUrl', pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest, ctx: { params?: unknown }) {
  if (authEnabled) return (guarded as unknown as (r: NextRequest, c: unknown) => Promise<Response>)(req, ctx);
  // Fail closed: never serve customer and applicant data publicly without login.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_NO_AUTH !== 'true') {
    return new NextResponse('Login is not configured. Set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and AUTH_SECRET.', { status: 503 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};

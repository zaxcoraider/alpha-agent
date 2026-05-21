import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';

const COOKIE_NAME = 'alpha_auth';

// These paths are always public — no auth needed
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/inngest',   // Inngest webhook must stay open
  '/_next',
  '/favicon.ico',
];

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken = process.env.ACCESS_TOKEN;

  // No token configured — skip auth (local dev without token set)
  if (!accessToken) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME);
  const expectedHash = tokenHash(accessToken);

  if (cookie?.value === expectedHash) {
    return NextResponse.next();
  }

  // Not authenticated — redirect to login, preserve intended destination
  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

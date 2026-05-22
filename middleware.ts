import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'alpha_auth';

// These paths are always public — no auth needed
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/inngest',   // Inngest webhook must stay open
  '/_next',
  '/favicon.ico',
];

// Use Web Crypto API — Edge runtime doesn't support Node.js 'crypto' module
async function tokenHash(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(request: NextRequest) {
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
  const expectedHash = await tokenHash(accessToken);

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

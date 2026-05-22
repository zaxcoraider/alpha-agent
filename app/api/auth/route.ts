import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { env } from '@/lib/env';

const COOKIE_NAME  = 'alpha_auth';
const COOKIE_DAYS  = 30;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// POST /api/auth — validate token and set auth cookie
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: string };

  if (!env.ACCESS_TOKEN || body.token !== env.ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, tokenHash(env.ACCESS_TOKEN), {
    httpOnly: true,
    secure:   (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https'),
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * COOKIE_DAYS,
    path:     '/',
  });

  return response;
}

// DELETE /api/auth — clear auth cookie (logout)
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}

import { type NextRequest, NextResponse } from 'next/server';
import { fetchMarketBySlug } from '@/lib/sources/polymarket';
import { env } from '@/lib/env';
import { randomUUID } from 'crypto';
import type { SwarmDepth } from '@/lib/sources/mirofish';
import type { PredictMode } from '@/lib/agents/prediction';

function extractPolymarketSlug(input: string): string | null {
  try {
    const u = new URL(input);
    if (!u.hostname.includes('polymarket.com')) return null;
    const match = u.pathname.match(/\/event\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { input, depth = 'standard', mode = 'both' } = await req.json() as { input: string; depth?: SwarmDepth; mode?: PredictMode };
  if (!input?.trim()) {
    return NextResponse.json({ error: 'input is required' }, { status: 400 });
  }

  const jobId  = randomUUID();
  const slug   = extractPolymarketSlug(input.trim());
  const market = slug ? await fetchMarketBySlug(slug) : null;
  const question = market?.question ?? input.trim();

  // Delegate to VPS predict server (no timeout limits)
  const serverUrl = env.PREDICT_SERVER_URL;
  if (!serverUrl) {
    return NextResponse.json(
      {
        error:
          'Predict server not configured. Set PREDICT_SERVER_URL=http://YOUR_VPS_IP:5002 ' +
          'in Vercel env vars (the VPS runs the prediction pipeline because each prediction ' +
          'takes ~30-45 min and exceeds Vercel function limits).',
      },
      { status: 503 },
    );
  }

  const vpsRes = await fetch(`${serverUrl}/predict`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${env.ACCESS_TOKEN ?? ''}`,
    },
    body: JSON.stringify({ question, jobId, market: market ?? null, depth, mode }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => {
    console.error('[predict-custom] VPS reach failed:', err);
    return null;
  });

  if (!vpsRes) {
    return NextResponse.json(
      {
        error:
          `VPS predict server at ${serverUrl} is unreachable. ` +
          `Verify the VPS is running (check PM2: \`pm2 status\` for predict-server) ` +
          `and that the URL/port are correct.`,
      },
      { status: 503 },
    );
  }
  if (!vpsRes.ok) {
    const body = await vpsRes.text().catch(() => '');
    return NextResponse.json(
      { error: `VPS predict server responded ${vpsRes.status}: ${body.slice(0, 200)}` },
      { status: 503 },
    );
  }

  return NextResponse.json({ jobId, question, isRealMarket: market !== null });
}

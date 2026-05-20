import { type NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { fetchMarketBySlug } from '@/lib/sources/polymarket';
import { randomUUID } from 'crypto';

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
  const { input } = await req.json() as { input: string };
  if (!input?.trim()) {
    return NextResponse.json({ error: 'input is required' }, { status: 400 });
  }

  const jobId = randomUUID();
  const slug  = extractPolymarketSlug(input.trim());

  // If it's a Polymarket URL, pre-fetch the real market data
  const market = slug ? await fetchMarketBySlug(slug) : null;

  // question is the market question (if fetched) or the raw input
  const question = market?.question ?? input.trim();

  await inngest.send({
    name: 'agent/custom-predict',
    data: { question, jobId, market: market ?? null, chatId: null },
  });

  return NextResponse.json({ jobId, question, isRealMarket: market !== null });
}

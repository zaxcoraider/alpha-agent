const BASE = 'https://gamma-api.polymarket.com';

export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  outcomePrices: string[]; // ["0.65", "0.35"] — index 0 = YES price
  outcomes: string[];
  volume: string;
  liquidity: string;
  endDate: string;
  active: boolean;
  closed: boolean;
}

export interface ParsedMarket {
  id: string;
  question: string;
  description: string;
  yesPrice: number; // 0-1
  noPrice: number;  // 0-1
  volumeUsd: number;
  liquidityUsd: number;
  endDate: string;
  daysLeft: number;
}

export async function fetchActiveMarkets(opts?: {
  minVolume?: number; // USD, default 50_000
  maxDaysLeft?: number; // default 30
  limit?: number; // default 30
}): Promise<ParsedMarket[]> {
  const minVolume = opts?.minVolume ?? 50_000;
  const maxDaysLeft = opts?.maxDaysLeft ?? 30;
  const limit = opts?.limit ?? 30;

  const url = new URL(`${BASE}/markets`);
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('order', 'volume');
  url.searchParams.set('ascending', 'false');
  url.searchParams.set('limit', String(limit * 3)); // over-fetch, filter after

  const res = await fetch(url.toString(), {
    next: { revalidate: 300 }, // 5-min cache
  });

  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

  const markets: PolymarketMarket[] = await res.json();
  const now = Date.now();

  return markets
    .filter((m) => {
      if (!m.endDate || !m.outcomePrices?.length) return false;
      const volumeUsd = parseFloat(m.volume ?? '0');
      const daysLeft = (new Date(m.endDate).getTime() - now) / 86_400_000;
      return volumeUsd >= minVolume && daysLeft >= 1 && daysLeft <= maxDaysLeft;
    })
    .slice(0, limit)
    .map((m) => {
      const yesPrice = parseFloat(m.outcomePrices[0] ?? '0.5');
      return {
        id: m.id,
        question: m.question,
        description: m.description ?? '',
        yesPrice,
        noPrice: 1 - yesPrice,
        volumeUsd: parseFloat(m.volume ?? '0'),
        liquidityUsd: parseFloat(m.liquidity ?? '0'),
        endDate: m.endDate,
        daysLeft: Math.ceil(
          (new Date(m.endDate).getTime() - now) / 86_400_000
        ),
      };
    });
}

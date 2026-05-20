import type { ParsedMarket } from './polymarket';

// ─── Kalshi REST API client ───────────────────────────────────────────────────
// Public market data — no API key required for reads.
// Docs: https://trading-api.readme.io/reference/getmarkets
//
// Prices are in cents (0–99). Volumes are in contracts; dollar_volume (if
// present) gives direct USD. We fall back to volume * midPrice when absent.

const BASE = 'https://api.kalshi.com/trade-api/v2';

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  yes_bid: number;   // cents 0-99
  yes_ask: number;   // cents 0-99
  last_price?: number;
  volume: number;
  dollar_volume?: number;
  open_interest: number;
  close_time: string; // ISO-8601
  status: string;
  category?: string;
}

interface KalshiResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

export async function fetchKalshiMarkets(opts?: {
  minVolume?: number;  // USD, default 5_000 (Kalshi volumes are lower than Polymarket)
  maxDaysLeft?: number;
  limit?: number;
}): Promise<ParsedMarket[]> {
  const minVolume  = opts?.minVolume   ?? 5_000;
  const maxDaysLeft = opts?.maxDaysLeft ?? 90;
  const limit      = opts?.limit       ?? 20;

  const now = Date.now();
  const minCloseTs = Math.floor((now + 86_400_000) / 1000);           // min 1 day left
  const maxCloseTs = Math.floor((now + maxDaysLeft * 86_400_000) / 1000);

  const url = new URL(`${BASE}/markets`);
  url.searchParams.set('status', 'open');
  url.searchParams.set('limit', '200');
  url.searchParams.set('min_close_ts', String(minCloseTs));
  url.searchParams.set('max_close_ts', String(maxCloseTs));

  let data: KalshiResponse;
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Kalshi API ${res.status}`);
    data = await res.json() as KalshiResponse;
  } catch {
    return []; // Kalshi unavailable — fail gracefully
  }

  const markets = data.markets ?? [];

  // Sort highest-volume first
  markets.sort((a, b) => (b.dollar_volume ?? b.volume) - (a.dollar_volume ?? a.volume));

  const results: ParsedMarket[] = [];

  for (const m of markets) {
    if (results.length >= limit) break;
    if (m.status !== 'open') continue;

    const closeMs  = new Date(m.close_time).getTime();
    const daysLeft = (closeMs - now) / 86_400_000;
    if (daysLeft < 1 || daysLeft > maxDaysLeft) continue;

    // Mid-price, falling back to last_price, then 0.5
    const midPrice  = ((m.yes_bid + m.yes_ask) / 2) / 100;
    const yesPrice  = m.last_price ? m.last_price / 100 : midPrice || 0.5;

    // Skip effectively-resolved markets
    if (yesPrice <= 0.01 || yesPrice >= 0.99) continue;

    const volumeUsd = m.dollar_volume ?? m.volume * yesPrice;
    if (volumeUsd < minVolume) continue;

    results.push({
      id: `kalshi-${m.ticker}`,
      question: m.subtitle ? `${m.title} — ${m.subtitle}` : m.title,
      description: m.subtitle ?? '',
      yesPrice,
      noPrice: 1 - yesPrice,
      volumeUsd,
      liquidityUsd: m.open_interest * yesPrice,
      endDate: new Date(m.close_time).toISOString().slice(0, 10),
      daysLeft: Math.ceil(daysLeft),
      source: 'kalshi',
    });
  }

  return results;
}

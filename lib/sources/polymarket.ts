const BASE = 'https://gamma-api.polymarket.com';

// ─── Raw types from the /events API ──────────────────────────────────────────

interface PolymarketChildMarket {
  id: string;
  question: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[] | string;  // API returns JSON-encoded string e.g. "[\"0.65\",\"0.35\"]"
  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;
  endDate: string;
  active: boolean;
  closed: boolean;
}

interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  markets: PolymarketChildMarket[];
}

// The gamma API returns outcomePrices as a JSON-encoded string, not a real array
function parsePrices(raw: string[] | string | undefined): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length === 2 ? raw : null;
  try { const p = JSON.parse(raw); return Array.isArray(p) && p.length === 2 ? p : null; } catch { return null; }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ParsedMarket {
  id: string;
  question: string;
  description: string;
  yesPrice: number;  // 0-1
  noPrice: number;   // 0-1
  volumeUsd: number;
  liquidityUsd: number;
  endDate: string;
  daysLeft: number;
  source?: 'polymarket' | 'kalshi' | 'metaculus';
}

// Fetch a single market by Polymarket event slug (from a pasted URL)
export async function fetchMarketBySlug(slug: string): Promise<ParsedMarket | null> {
  try {
    const res = await fetch(`${BASE}/events?slug=${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const events: PolymarketEvent[] = await res.json();
    const event = events[0];
    if (!event) return null;

    const now = Date.now();
    for (const m of event.markets ?? []) {
      const prices = parsePrices(m.outcomePrices);
      if (!prices) continue;
      if (!m.active || m.closed) continue;
      const endDate = m.endDate ?? event.endDate;
      if (!endDate) continue;
      const daysLeft = (new Date(endDate).getTime() - now) / 86_400_000;
      if (daysLeft < 0) continue;
      const yesPrice = parseFloat(prices[0] ?? '0.5');
      return {
        id: m.id,
        question: m.question,
        description: m.description ?? event.description ?? '',
        yesPrice,
        noPrice: parseFloat(prices[1] ?? String(1 - yesPrice)),
        volumeUsd: m.volumeNum ?? parseFloat(m.volume ?? '0'),
        liquidityUsd: m.liquidityNum ?? parseFloat(m.liquidity ?? '0'),
        endDate,
        daysLeft: Math.ceil(daysLeft),
        source: 'polymarket',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchActiveMarkets(opts?: {
  minVolume?: number;   // USD, default 50_000
  maxDaysLeft?: number; // default 90
  limit?: number;       // default 30
}): Promise<ParsedMarket[]> {
  const minVolume = opts?.minVolume ?? 50_000;
  const maxDaysLeft = opts?.maxDaysLeft ?? 90;
  const limit = opts?.limit ?? 30;

  // High-volume markets live under /events — /markets returns tiny per-contract volumes.
  // Pass end_date_max so long-dated events (2028 elections etc.) don't crowd out near-term markets.
  const maxDate = new Date(Date.now() + maxDaysLeft * 86_400_000).toISOString().slice(0, 10);

  const url = new URL(`${BASE}/events`);
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('order', 'volume');
  url.searchParams.set('ascending', 'false');
  url.searchParams.set('end_date_max', maxDate);
  url.searchParams.set('limit', '100'); // over-fetch, flatten + filter below

  const res = await fetch(url.toString(), {
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

  const events: PolymarketEvent[] = await res.json();
  const now = Date.now();
  const results: ParsedMarket[] = [];

  outer: for (const event of events) {
    for (const m of event.markets ?? []) {
      if (results.length >= limit) break outer;

      // Only binary YES/NO
      const prices = parsePrices(m.outcomePrices);
      if (!prices) continue;
      if (!m.active || m.closed) continue;

      const endDate = m.endDate ?? event.endDate;
      if (!endDate) continue;

      const daysLeft = (new Date(endDate).getTime() - now) / 86_400_000;
      if (daysLeft < 1 || daysLeft > maxDaysLeft) continue;

      // volumeNum is the pre-parsed numeric field
      const volumeUsd = m.volumeNum ?? parseFloat(m.volume ?? '0');
      if (volumeUsd < minVolume) continue;

      const yesPrice = parseFloat(prices[0] ?? '0.5');
      // Skip effectively-resolved markets (≤1% or ≥99%) — no edge possible
      if (yesPrice <= 0.01 || yesPrice >= 0.99) continue;

      results.push({
        id: m.id,
        question: m.question,
        description: m.description ?? event.description ?? '',
        yesPrice,
        noPrice: parseFloat(prices[1] ?? String(1 - yesPrice)),
        volumeUsd,
        liquidityUsd: m.liquidityNum ?? parseFloat(m.liquidity ?? '0'),
        endDate,
        daysLeft: Math.ceil(daysLeft),
        source: 'polymarket',
      });
    }
  }

  return results;
}

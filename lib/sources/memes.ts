import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// ── Raw meme token schema from Grok ──────────────────────────────────────────

const GrokMemeSchema = z.object({
  tokens: z.array(z.object({
    name:             z.string(),
    ticker:           z.string(),
    chain:            z.enum(['sol', 'eth', 'base', 'bnb']),
    contractAddress:  z.string().optional(),
    marketCapUsd:     z.number().min(0).optional(),
    priceUsd:         z.number().min(0).optional(),
    priceChange1h:    z.number().optional(),     // percent, can be negative
    priceChange24h:   z.number().optional(),
    volumeUsd24h:     z.number().min(0).optional(),
    liquidity:        z.number().min(0).optional(),
    holderCount:      z.number().int().min(0).optional(),
    topHolderPct:     z.number().min(0).max(100).optional(), // % held by top 10
    deployedHoursAgo: z.number().min(0).optional(),
    ctMentions:       z.number().int().min(0),
    ctVelocity:       z.number().min(0),
    mentionedByKOL:   z.boolean(),
    kolHandles:       z.array(z.string()),
    narrative:        z.string(),               // "AI meme", "animal", "political", etc.
    dexUrl:           z.string().optional(),
  })).max(25),
});

export type RawMemeToken = z.infer<typeof GrokMemeSchema>['tokens'][0] & {
  source: 'grok' | 'dexscreener';
};

// ── Grok CT real-time meme scan ───────────────────────────────────────────────

export async function scanCTForMemes(): Promise<RawMemeToken[]> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),  // deepseek-v3.2 — confirmed working
      schema:      GrokMemeSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `You have real-time access to X (Twitter). Scan Crypto Twitter RIGHT NOW for emerging meme coins with early alpha signals.

Focus on these 4 chains: Solana (sol), Ethereum (eth), Base (base), BNB Chain (bnb)

Search signals:
- "$TICKER" + "just launched" OR "stealth launch" OR "fair launch"
- "new meme" OR "new token" OR "100x gem" + contract address
- "CA:" or "contract:" + Solana/EVM address in KOL tweets
- "rug-proof" OR "liquidity locked" + new token
- Trending hashtags around meme coins (#memecoin #solana #base #bnbchain)
- Tokens mentioned by 3+ different accounts in the last 2 hours
- KOL account posts about "gem" or "early" + ticker symbol

For each token:
- ctMentions: total unique X accounts mentioning it in the past 6 hours
- ctVelocity: mentions per hour (estimate trend — is it accelerating?)
- mentionedByKOL: true if any account with 10k+ followers mentioned it
- kolHandles: up to 5 influential handles (without @)
- narrative: the meme theme — "AI agent", "political figure", "animal", "celebrity", "chain mascot", "trending news", "defi meme", "culture ref"
- marketCapUsd: current market cap if findable on-chain/DexScreener (0 if unknown)
- priceChange1h: approximate 1-hour price change percent
- topHolderPct: approximate % of supply in top 10 wallets (rug signal)
- deployedHoursAgo: hours since contract was deployed (0-24 is very early)
- dexUrl: DexScreener link if you can find it

PRIORITY: Tokens under $1M market cap, deployed <24h ago, with growing CT mentions — that's the early gem signal. Avoid already-pumped tokens with >$50M mcap unless velocity is extreme.`,
    });

    return object.tokens.map((t) => ({ ...t, source: 'grok' as const }));
  } catch {
    return [];
  }
}

// ── DexScreener — top boosted / trending ─────────────────────────────────────

type DexBoostToken = {
  tokenAddress: string;
  chainId: string;
  url: string;
  description?: string;
  links?: { label?: string; url: string }[];
};

type DexPair = {
  chainId: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  priceChange?: { h1?: number; h24?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  url: string;
};

const DEX_CHAIN_MAP: Record<string, RawMemeToken['chain'] | undefined> = {
  solana: 'sol', ethereum: 'eth', base: 'base', bsc: 'bnb',
};

export async function fetchDexScreenerTrending(): Promise<RawMemeToken[]> {
  try {
    // Top boosted tokens (free endpoint, no API key)
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
      headers: { accept: 'application/json' },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const boosts = await res.json() as DexBoostToken[];
    const top    = boosts.slice(0, 20);

    // Enrich with pair data for each token
    const results: RawMemeToken[] = [];

    await Promise.all(top.map(async (boost) => {
      const chain = DEX_CHAIN_MAP[boost.chainId];
      if (!chain) return; // skip unsupported chains

      try {
        const pairRes = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${boost.tokenAddress}`,
          { signal: AbortSignal.timeout(8_000) },
        );
        if (!pairRes.ok) return;

        const pairData = await pairRes.json() as { pairs?: DexPair[] };
        const pair     = pairData.pairs?.[0];
        if (!pair) return;

        const nowMs          = Date.now();
        const deployedMs     = pair.pairCreatedAt ?? nowMs;
        const deployedHoursAgo = Math.max(0, (nowMs - deployedMs) / 3_600_000);

        results.push({
          name:             pair.baseToken.name,
          ticker:           pair.baseToken.symbol,
          chain,
          contractAddress:  pair.baseToken.address,
          marketCapUsd:     pair.marketCap ?? pair.fdv,
          priceUsd:         pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
          priceChange1h:    pair.priceChange?.h1,
          priceChange24h:   pair.priceChange?.h24,
          volumeUsd24h:     pair.volume?.h24,
          liquidity:        pair.liquidity?.usd,
          deployedHoursAgo: Math.round(deployedHoursAgo),
          ctMentions:       0,
          ctVelocity:       0,
          mentionedByKOL:   false,
          kolHandles:       [],
          narrative:        'trending',
          dexUrl:           boost.url,
          source:           'dexscreener' as const,
        });
      } catch {
        // skip tokens that fail enrichment
      }
    }));

    return results;
  } catch {
    return [];
  }
}

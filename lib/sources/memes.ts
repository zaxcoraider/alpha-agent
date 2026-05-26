import { generateText, generateObject } from 'ai';
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

// ── 2-step pipeline: Grok fetches live CT → DeepSeek structures it ────────────

export async function scanCTForMemes(): Promise<RawMemeToken[]> {
  // Step 1: Grok searches X in real-time for emerging meme coin signals
  let ctReport = '';
  try {
    const { text } = await generateText({
      model:       dgrid(MODELS.grok),
      abortSignal: AbortSignal.timeout(40_000),
      prompt: `Search X (Twitter) right now for emerging meme coins with early alpha signals. Focus on Solana, Ethereum, Base, and BNB Chain.

Search for:
- "$TICKER" + "just launched" OR "stealth launch" OR "fair launch"
- "new meme" OR "new token" OR "100x gem" + contract address
- "CA:" or "contract:" + Solana/EVM address in KOL tweets
- "rug-proof" OR "liquidity locked" + new token
- Trending meme coin hashtags (#memecoin #solana #base #bnbchain)
- Tokens mentioned by 3+ different accounts in the last 2 hours
- KOL posts about "gem" or "early" + ticker symbol

For each token, report: name, ticker, chain, contract address, current market cap, price changes (1h/24h), trading volume, liquidity, how many wallets hold it, top holder concentration %, hours since deployed, how many X accounts are talking about it, which KOLs mentioned it, DexScreener link, the meme narrative/theme.

Priority: tokens under $1M mcap deployed <24h ago with growing CT velocity — that's the early gem signal.`,
    });
    ctReport = text;
  } catch {
    return [];
  }

  if (!ctReport.trim()) return [];

  // Step 2: DeepSeek parses Grok's live meme scan into structured schema
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),
      schema:      GrokMemeSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `Parse the following real-time meme coin intelligence report (fetched from Grok's live X search) into structured token entries.

LIVE CT REPORT:
${ctReport}

Rules:
- Only extract tokens explicitly mentioned in the report — no hallucinations
- narrative: "AI agent", "political figure", "animal", "celebrity", "chain mascot", "trending news", "defi meme", "culture ref"
- ctVelocity: mentions per hour (estimate from report)
- topHolderPct: rug signal — high % = risky`,
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

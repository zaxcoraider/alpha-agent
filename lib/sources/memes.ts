import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// ── Raw meme token schema from Grok ──────────────────────────────────────────

const GrokMemeSchema = z.object({
  tokens: z.array(z.object({
    name:             z.string(),
    ticker:           z.string(),
    chain:            z.enum(['sol', 'eth', 'base', 'bnb']),
    contractAddress:  z.string().optional(),
    marketCapUsd:     z.number().optional(),
    priceUsd:         z.number().optional(),
    priceChange1h:    z.number().optional(),
    priceChange24h:   z.number().optional(),
    volumeUsd24h:     z.number().optional(),
    liquidity:        z.number().optional(),
    holderCount:      z.number().transform(n => Math.max(0, Math.round(n))).optional(),
    topHolderPct:     z.number().transform(n => Math.max(0, Math.min(100, n))).optional(),
    deployedHoursAgo: z.number().optional(),
    ctMentions:       z.number().transform(n => Math.max(0, Math.round(n))),
    ctVelocity:       z.number().transform(n => Math.max(0, n)),
    mentionedByKOL:   z.boolean(),
    kolHandles:       z.array(z.string()),
    narrative:        z.string(),
    dexUrl:           z.string().optional(),
  })),
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
      model:       dgridNoTemp(MODELS.grok),
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
  } catch (err) {
    console.error('[sources/memes] Grok step-1 failed:', err);
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
  } catch (err) {
    console.error('[sources/memes] DeepSeek step-2 failed:', err);
    return [];
  }
}

// ── DexScreener — top boosted + latest profiles ──────────────────────────────

type DexEntry = {
  tokenAddress: string;
  chainId: string;
  url: string;
  description?: string;
  narrative?: string;
};

type DexPair = {
  chainId: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  txns?: { h1?: { buys: number; sells: number }; h24?: { buys: number; sells: number } };
  volume?: { h1?: number; h24?: number };
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

async function enrichToken(entry: DexEntry): Promise<RawMemeToken | null> {
  const chain = DEX_CHAIN_MAP[entry.chainId];
  if (!chain) return null;
  try {
    const pairRes = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${entry.tokenAddress}`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
    );
    if (!pairRes.ok) return null;

    const pairData = await pairRes.json() as { pairs?: DexPair[] };
    // pick the pair with highest 24h volume
    const pairs = pairData.pairs ?? [];
    const pair  = pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
    if (!pair) return null;

    const nowMs             = Date.now();
    const deployedHoursAgo = Math.max(0, (nowMs - (pair.pairCreatedAt ?? nowMs)) / 3_600_000);

    // derive a meme narrative hint from description
    const desc = (entry.description ?? '').toLowerCase();
    const narrative =
      /ai|agent|llm|gpt|robot/.test(desc)    ? 'AI meme' :
      /trump|biden|elon|maga|pepe/.test(desc) ? 'political figure' :
      /dog|cat|shib|doge|animal/.test(desc)   ? 'animal' :
      /tik.?tok|viral|trend/.test(desc)       ? 'trending news' :
      entry.narrative ?? 'trending';

    return {
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
      deployedHoursAgo: deployedHoursAgo,
      ctMentions:       0,
      ctVelocity:       0,
      mentionedByKOL:   false,
      kolHandles:       [],
      narrative,
      dexUrl:           entry.url,
      source:           'dexscreener' as const,
    };
  } catch {
    return null;
  }
}

export async function fetchDexScreenerTrending(): Promise<RawMemeToken[]> {
  try {
  // Fetch top boosted AND latest profiles in parallel
  const [boostsRes, profilesRes] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-boosts/top/v1',      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }),
    fetch('https://api.dexscreener.com/token-profiles/latest/v1', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }),
  ]);

  const entries: DexEntry[] = [];

  if (boostsRes.status === 'fulfilled' && boostsRes.value.ok) {
    const boosts = await boostsRes.value.json() as DexEntry[];
    entries.push(...boosts.slice(0, 15).map((b) => ({ ...b, narrative: 'boosted' })));
  }
  if (profilesRes.status === 'fulfilled' && profilesRes.value.ok) {
    const profiles = await profilesRes.value.json() as DexEntry[];
    // Latest profiles = newest launches, high early-alpha value
    entries.push(...profiles.slice(0, 15).map((p) => ({ ...p, narrative: 'new launch' })));
  }

  // Deduplicate by tokenAddress
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    if (seen.has(e.tokenAddress)) return false;
    seen.add(e.tokenAddress);
    return true;
  });

  // Enrich all in parallel, drop failures
  const settled = await Promise.allSettled(unique.map(enrichToken));
  const results: RawMemeToken[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) results.push(r.value);
  }

  return results;
  } catch (err) {
    console.error('[sources/memes] fetchDexScreenerTrending failed:', err);
    return [];
  }
}

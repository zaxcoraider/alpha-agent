import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { scanCTForMemes, fetchDexScreenerTrending, type RawMemeToken } from '@/lib/sources/memes';

// ── Output schema ─────────────────────────────────────────────────────────────

export const MemeTokenSchema = z.object({
  name:             z.string(),
  ticker:           z.string(),
  chain:            z.enum(['sol', 'eth', 'base', 'bnb']),
  contractAddress:  z.string().optional(),
  marketCapUsd:     z.number().min(0).optional(),
  priceUsd:         z.number().min(0).optional(),
  priceChange1h:    z.number().optional(),
  priceChange24h:   z.number().optional(),
  volumeUsd24h:     z.number().min(0).optional(),
  liquidity:        z.number().min(0).optional(),
  holderCount:      z.number().int().min(0).optional(),
  topHolderPct:     z.number().min(0).max(100).optional(),
  deployedHoursAgo: z.number().min(0).optional(),

  ctMentions:     z.number().int().min(0),
  ctVelocity:     z.number().min(0),
  mentionedByKOL: z.boolean(),
  kolHandles:     z.array(z.string()),

  narrative:       z.string(),
  narrativeScore:  z.number().int().min(0).max(25),  // how strong is the narrative?
  kolScore:        z.number().int().min(0).max(25),  // KOL + CT momentum
  safetyScore:     z.number().int().min(0).max(25),  // contract / holder safety
  volumeScore:     z.number().int().min(0).max(25),  // volume / liquidity quality

  gemScore:     z.number().int().min(0).max(100),
  gemBreakdown: z.string().max(400),

  rugRisk:  z.enum(['low', 'medium', 'high', 'critical']),
  rugFlags: z.array(z.string()),

  category:       z.enum(['new_gem', 'trending', 'fading', 'pumped']),
  priceTarget:    z.string().optional(), // "3-5x potential in 48h"
  watchAction:    z.enum(['buy_small', 'watch', 'avoid']),
  watchReason:    z.string().max(200),

  dexUrl:  z.string().optional(),
  source:  z.string(),
});

export type MemeToken = z.infer<typeof MemeTokenSchema>;

// ── Analysis ──────────────────────────────────────────────────────────────────

async function analyzeToken(raw: RawMemeToken): Promise<MemeToken | null> {
  try {
    const mcapStr = raw.marketCapUsd
      ? `$${(raw.marketCapUsd / 1_000).toFixed(0)}K`
      : 'unknown';

    const { object } = await generateObject({
      model:       dgrid(MODELS.reasoner),
      schema:      MemeTokenSchema,
      abortSignal: AbortSignal.timeout(25_000),
      prompt: `Analyze this meme coin for gem potential and rug risk.

Token data:
Name: ${raw.name} ($${raw.ticker})
Chain: ${raw.chain.toUpperCase()}
Contract: ${raw.contractAddress ?? 'not provided'}
Market cap: ${mcapStr}
Price change 1h: ${raw.priceChange1h !== undefined ? `${raw.priceChange1h > 0 ? '+' : ''}${raw.priceChange1h.toFixed(1)}%` : 'unknown'}
Price change 24h: ${raw.priceChange24h !== undefined ? `${raw.priceChange24h > 0 ? '+' : ''}${raw.priceChange24h.toFixed(1)}%` : 'unknown'}
Volume 24h: ${raw.volumeUsd24h ? `$${(raw.volumeUsd24h / 1_000).toFixed(0)}K` : 'unknown'}
Liquidity: ${raw.liquidity ? `$${(raw.liquidity / 1_000).toFixed(0)}K` : 'unknown'}
Top 10 holder %: ${raw.topHolderPct !== undefined ? `${raw.topHolderPct.toFixed(1)}%` : 'unknown'}
Contract age: ${raw.deployedHoursAgo !== undefined ? `${raw.deployedHoursAgo.toFixed(1)}h ago` : 'unknown'}
CT mentions: ${raw.ctMentions} total · ${raw.ctVelocity.toFixed(1)}/hr velocity
KOL mentioned: ${raw.mentionedByKOL} — handles: ${raw.kolHandles.join(', ') || 'none'}
Narrative: ${raw.narrative}
Source: ${raw.source}

── GEM SCORE (0–100, split into 4 sub-scores of 25 each) ──

narrativeScore (0-25): How strong and timely is the meme narrative?
+25 narrative is currently viral/trending (AI, political, major news event)
+18 narrative is hot but not breaking (animal meta, culture ref)
+10 narrative is niche but genuine
+5  generic / no clear narrative

kolScore (0-25): KOL and CT momentum signals
+25 multiple 100k+ KOL accounts posting, velocity >20/hr
+18 at least one major KOL + velocity >5/hr
+12 growing CT mentions, no major KOL yet
+5  low mentions, low velocity

safetyScore (0-25): Contract and holder safety
+25 deployed <6h, top 10 holders <40%, liquidity present
+18 deployed <24h, top 10 <50%
+10 deployed <48h, some concentration risk
+0  red flags: top holders >70%, no liquidity, anonymous dev with large wallet

volumeScore (0-25): Volume and liquidity quality
+25 volume:mcap ratio >0.5, liquidity >$100K
+18 volume:mcap >0.2, liquidity >$50K
+10 some volume, liquidity building
+5  very low volume or liquidity (<$10K)

gemScore = narrativeScore + kolScore + safetyScore + volumeScore

── RUG RISK ──
Check each flag:
- Top 10 wallets hold >60% of supply: +1 flag
- Liquidity <$10K: +1 flag
- Deployed <1h with >$500K mcap (suspicious instant pump): +1 flag
- No contract verification: +1 flag
- Single wallet holds >20%: +1 flag
- Honeypot patterns (can't sell signals on CT): +1 flag
- Dev wallet selling: +1 flag
- Copy-paste contract from known rug: +1 flag

0 flags → low | 1-2 → medium | 3-4 → high | 5+ → critical

── CATEGORY ──
new_gem: deployed <24h, mcap <$500K, growing signals
trending: gaining momentum, mcap $500K-$10M, strong CT
fading: peaked, losing momentum
pumped: already >10x, likely too late for safe entry

── WATCH ACTION ──
buy_small: Strong early signals, acceptable risk — small position worth considering
watch: Interesting but needs more confirmation — monitor closely
avoid: Rug flags too high or too late to enter safely

Be honest. Most meme coins fail — score low if signals are weak.`,
    });

    return { ...object, source: raw.source };
  } catch {
    return null;
  }
}

// ── Main scan ─────────────────────────────────────────────────────────────────

export async function runMemesScan(): Promise<{ tokens: MemeToken[]; scanned: number }> {
  const [grokTokens, dexTokens] = await Promise.all([
    scanCTForMemes(),
    fetchDexScreenerTrending(),
  ]);

  const all = [...grokTokens, ...dexTokens];

  // Deduplicate by ticker+chain
  const seen = new Set<string>();
  const unique: RawMemeToken[] = [];
  for (const t of all) {
    const key = `${t.ticker.toLowerCase()}-${t.chain}`;
    if (!seen.has(key)) { seen.add(key); unique.push(t); }
  }

  // Grok-first, cap at 20
  const ordered = [
    ...unique.filter((t) => t.source === 'grok'),
    ...unique.filter((t) => t.source !== 'grok'),
  ].slice(0, 20);

  const tokens: MemeToken[] = [];
  for (let i = 0; i < ordered.length; i += 3) {
    const batch   = ordered.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(analyzeToken));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) tokens.push(r.value);
    }
  }

  // Filter pumped + sort by gem score
  const active = tokens.filter((t) => t.category !== 'fading');
  active.sort((a, b) => b.gemScore - a.gemScore);

  return { tokens: active, scanned: all.length };
}

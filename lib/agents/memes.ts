import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { scanCTForMemes, fetchDexScreenerTrending, type RawMemeToken } from '@/lib/sources/memes';

// ── Output schema ─────────────────────────────────────────────────────────────

// Normalise enum strings: lowercase + spaces→underscores (handles 'New Gem' → 'new_gem')
const en = (v: unknown) => String(v ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

export const MemeTokenSchema = z.object({
  name:             z.string(),
  ticker:           z.string(),
  chain:            z.preprocess(v => {
    const m: Record<string, string> = {
      sol: 'sol', solana: 'sol',
      eth: 'eth', ethereum: 'eth',
      base: 'base',
      bnb: 'bnb', bsc: 'bnb', 'bnb_chain': 'bnb', 'bnb chain': 'bnb',
    };
    return m[String(v ?? '').toLowerCase().trim()] ?? String(v ?? '').toLowerCase().trim();
  }, z.enum(['sol', 'eth', 'base', 'bnb'])).catch('eth'),
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

  ctMentions:     z.number().transform(n => Math.max(0, Math.round(n))),
  ctVelocity:     z.number().transform(n => Math.max(0, n)),
  mentionedByKOL: z.boolean().catch(false),
  kolHandles:     z.array(z.string()).catch([]),

  narrative:       z.string(),
  narrativeScore:  z.number().transform(n => Math.max(0, Math.min(25, Math.round(n)))),
  kolScore:        z.number().transform(n => Math.max(0, Math.min(25, Math.round(n)))),
  safetyScore:     z.number().transform(n => Math.max(0, Math.min(25, Math.round(n)))),
  volumeScore:     z.number().transform(n => Math.max(0, Math.min(25, Math.round(n)))),

  gemScore:     z.number().transform(n => Math.max(0, Math.min(100, Math.round(n)))),
  gemBreakdown: z.string().transform(s => s.slice(0, 400)),

  rugRisk:  z.preprocess(en, z.enum(['low', 'medium', 'high', 'critical'])).catch('medium'),
  rugFlags: z.array(z.string()).catch([]),

  category:       z.preprocess(en, z.enum(['new_gem', 'trending', 'fading', 'pumped'])).catch('trending'),
  priceTarget:    z.string().optional(),
  watchAction:    z.preprocess(en, z.enum(['buy_small', 'watch', 'avoid'])).catch('watch'),
  watchReason:    z.string().transform(s => s.slice(0, 200)),

  entryMarketCap: z.string().optional(),
  entryStrategy:  z.string().transform(s => s.slice(0, 250)),
  x2Target:       z.string().optional(),
  x5Target:       z.string().optional(),
  developerFlags: z.array(z.string()).catch([]),

  dexUrl:  z.string().optional(),
  source:  z.string(),
});

export type MemeToken = z.infer<typeof MemeTokenSchema>;

// ── Per-token analysis (Sonnet 4.6 + Grok live CT context) ───────────────────

async function analyzeToken(raw: RawMemeToken, grokContext: string): Promise<MemeToken | null> {
  try {
    const mcapStr = raw.marketCapUsd
      ? `$${(raw.marketCapUsd / 1_000).toFixed(0)}K`
      : 'unknown';

    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),
      schema:      MemeTokenSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
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

LIVE CT CONTEXT (from Grok X search right now):
${grokContext || 'No real-time CT data available.'}

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
0 flags → low | 1-2 → medium | 3-4 → high | 5+ → critical
Flags: top 10 wallets >60%, liquidity <$10K, instant pump <1h, unverified contract, single wallet >20%, honeypot signals, dev wallet selling, copy-paste rug contract.

── CATEGORY ──
new_gem: deployed <24h, mcap <$500K, growing signals
trending: momentum building, mcap $500K-$10M, strong CT
fading: peaked, losing momentum
pumped: already >10x, likely too late

── WATCH ACTION ──
buy_small: Strong early signals, acceptable risk
watch: Interesting but needs confirmation
avoid: Too risky or too late

── ENTRY STRATEGY ──
Concrete: "Buy 0.5 SOL if mcap < $300K. Take 50% at 3x, hold rest for 10x or zero."

Be honest. Most meme coins fail — score low if signals are weak.`,
    });

    return { ...object, source: raw.source };
  } catch (err) {
    console.error('[memes] analyzeToken failed:', err);
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
  console.log(`[memes] sources returned: grok=${grokTokens.length} dex=${dexTokens.length}`);

  // Deduplicate by ticker+chain
  const seen = new Set<string>();
  const unique: RawMemeToken[] = [];
  for (const t of all) {
    const key = `${t.ticker.toLowerCase()}-${t.chain}`;
    if (!seen.has(key)) { seen.add(key); unique.push(t); }
  }

  // Grok-first, cap at 5 to stay within Vercel timeout + save credits
  const ordered = [
    ...unique.filter((t) => t.source === 'grok'),
    ...unique.filter((t) => t.source !== 'grok'),
  ].slice(0, 5);

  console.log(`[memes] analyzing ${ordered.length} tokens`);

  // Analyze all in parallel — no second Grok enrichment call (saves credits)
  const results = await Promise.allSettled(ordered.map((t) => analyzeToken(t, '')));
  const tokens: MemeToken[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) tokens.push(r.value);
  }

  console.log(`[memes] analysis done: ${tokens.length} tokens produced`);

  // Filter fading + sort by gem score
  const active = tokens.filter((t) => t.category !== 'fading');
  active.sort((a, b) => b.gemScore - a.gemScore);

  return { tokens: active, scanned: all.length };
}

import { generateText } from 'ai';
import { z } from 'zod';
import { dgridNoTemp } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';
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

async function analyzeToken(raw: RawMemeToken, _grokContext: string): Promise<MemeToken | null> {
  try {
    const mcap = raw.marketCapUsd ? `$${(raw.marketCapUsd / 1_000).toFixed(0)}K` : 'unknown';

    // Opus 4.7 for rug detection + gem scoring — Sonnet misses subtle red flags.
    // dgridNoTemp because Opus rejects the temperature parameter.
    const { text } = await generateText({
      model:       dgridNoTemp(AGENT_MODELS.memes),
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `You are a meme coin analyst. Analyze the token below and reply with ONLY a valid JSON object. No markdown fences, no explanation.

TOKEN DATA:
Name: ${raw.name} | Ticker: $${raw.ticker} | Chain: ${raw.chain}
Market cap: ${mcap} | Contract: ${raw.contractAddress ?? 'unknown'}
Price 1h: ${raw.priceChange1h ?? '?'}% | 24h: ${raw.priceChange24h ?? '?'}%
Volume 24h: $${((raw.volumeUsd24h ?? 0) / 1000).toFixed(0)}K | Liquidity: $${((raw.liquidity ?? 0) / 1000).toFixed(0)}K
Top 10 holders: ${raw.topHolderPct ?? '?'}% | Age: ${raw.deployedHoursAgo?.toFixed(1) ?? '?'}h
CT mentions: ${raw.ctMentions} @ ${raw.ctVelocity.toFixed(1)}/hr | KOL: ${raw.mentionedByKOL}
Narrative: ${raw.narrative}

REQUIRED JSON FIELDS (use exact field names and allowed values):
- name: string
- ticker: string
- chain: must be one of "sol" "eth" "base" "bnb"
- narrativeScore: integer 0-25
- kolScore: integer 0-25
- safetyScore: integer 0-25
- volumeScore: integer 0-25
- gemScore: integer 0-100 (sum of 4 scores)
- gemBreakdown: string (max 300 chars, why this score)
- rugRisk: must be one of "low" "medium" "high" "critical"
- rugFlags: array of strings (rug warning flags, can be empty array)
- category: must be one of "new_gem" "trending" "fading" "pumped"
- watchAction: must be one of "buy_small" "watch" "avoid"
- watchReason: string (max 150 chars)
- entryStrategy: string (concrete buy/sell advice, max 200 chars)
- developerFlags: array of strings (can be empty array)
- narrative: string (1 sentence about the meme theme)
- mentionedByKOL: boolean
- kolHandles: array of strings
- ctMentions: integer
- ctVelocity: number
- source: "${raw.source}"

Also include these optional fields if known (use null if unknown):
- contractAddress, marketCapUsd, priceUsd, priceChange1h, priceChange24h, volumeUsd24h, liquidity, holderCount, topHolderPct, deployedHoursAgo, priceTarget, entryMarketCap, x2Target, x5Target, dexUrl`,
    });

    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.error('[memes] no JSON in response for', raw.ticker); return null; }

    let obj: Record<string, unknown>;
    try { obj = JSON.parse(match[0]); }
    catch (e) { console.error('[memes] JSON.parse failed for', raw.ticker, e); return null; }

    const parsed = MemeTokenSchema.safeParse(obj);
    if (!parsed.success) {
      console.error('[memes] schema failed for', raw.ticker, JSON.stringify(parsed.error.issues[0]));
      return null;
    }
    return parsed.data;
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

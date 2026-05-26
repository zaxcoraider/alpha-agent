import { generateText } from 'ai';
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

async function analyzeToken(raw: RawMemeToken, _grokContext: string): Promise<MemeToken | null> {
  try {
    const mcap = raw.marketCapUsd ? `$${(raw.marketCapUsd / 1_000).toFixed(0)}K` : 'unknown';

    const { text } = await generateText({
      model:       dgrid(MODELS.classifier),
      abortSignal: AbortSignal.timeout(45_000),
      prompt: `Analyze this meme coin. Reply with ONLY a JSON object — no markdown, no explanation.

Token: ${raw.name} ($${raw.ticker}) on ${raw.chain}
Contract: ${raw.contractAddress ?? 'unknown'} | Mcap: ${mcap}
1h: ${raw.priceChange1h ?? 'n/a'}% | 24h: ${raw.priceChange24h ?? 'n/a'}%
Vol 24h: ${raw.volumeUsd24h ? `$${(raw.volumeUsd24h/1000).toFixed(0)}K` : 'n/a'} | Liq: ${raw.liquidity ? `$${(raw.liquidity/1000).toFixed(0)}K` : 'n/a'}
Top10 holders: ${raw.topHolderPct ?? 'n/a'}% | Age: ${raw.deployedHoursAgo?.toFixed(1) ?? 'n/a'}h
CT: ${raw.ctMentions} mentions @ ${raw.ctVelocity.toFixed(1)}/hr | KOL: ${raw.mentionedByKOL}
Narrative: ${raw.narrative}

Return this exact JSON (use ONLY the allowed values shown):
{
  "name": "${raw.name}",
  "ticker": "${raw.ticker}",
  "chain": "${raw.chain}",
  "contractAddress": ${raw.contractAddress ? `"${raw.contractAddress}"` : 'null'},
  "marketCapUsd": ${raw.marketCapUsd ?? null},
  "priceUsd": ${raw.priceUsd ?? null},
  "priceChange1h": ${raw.priceChange1h ?? null},
  "priceChange24h": ${raw.priceChange24h ?? null},
  "volumeUsd24h": ${raw.volumeUsd24h ?? null},
  "liquidity": ${raw.liquidity ?? null},
  "holderCount": ${raw.holderCount ?? null},
  "topHolderPct": ${raw.topHolderPct ?? null},
  "deployedHoursAgo": ${raw.deployedHoursAgo ?? null},
  "ctMentions": ${raw.ctMentions},
  "ctVelocity": ${raw.ctVelocity},
  "mentionedByKOL": ${raw.mentionedByKOL},
  "kolHandles": ${JSON.stringify(raw.kolHandles)},
  "narrative": "<1 sentence describing the meme narrative>",
  "narrativeScore": <0-25>,
  "kolScore": <0-25>,
  "safetyScore": <0-25>,
  "volumeScore": <0-25>,
  "gemScore": <0-100, sum of 4 scores>,
  "gemBreakdown": "<why this score, max 300 chars>",
  "rugRisk": "<exactly one of: low, medium, high, critical>",
  "rugFlags": ["<flag1>", "<flag2>"],
  "category": "<exactly one of: new_gem, trending, fading, pumped>",
  "priceTarget": "<optional target price>",
  "watchAction": "<exactly one of: buy_small, watch, avoid>",
  "watchReason": "<reason, max 150 chars>",
  "entryMarketCap": "<e.g. under $500K>",
  "entryStrategy": "<concrete entry/exit strategy, max 200 chars>",
  "x2Target": "<2x price target or null>",
  "x5Target": "<5x price target or null>",
  "developerFlags": [],
  "dexUrl": ${raw.dexUrl ? `"${raw.dexUrl}"` : 'null'},
  "source": "${raw.source}"
}`,
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

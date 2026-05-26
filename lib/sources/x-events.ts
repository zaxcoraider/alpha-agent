import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// ── Raw event schema ──────────────────────────────────────────────────────────

const en = (v: unknown) => String(v ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

const GrokXEventSchema = z.object({
  events: z.array(z.object({
    type:           z.preprocess(en, z.enum(['space', 'viral_thread', 'kol_alert', 'airdrop', 'token_unlock', 'listing', 'narrative_shift', 'whale_move'])).catch('kol_alert'),
    title:          z.string(),
    description:    z.string().transform(s => s.slice(0, 300)),
    kolHandle:      z.string().optional(),
    followersCount: z.number().transform(n => Math.max(0, Math.round(n))).optional(),
    ticker:         z.string().optional(),
    chain:          z.preprocess(v => {
      const m: Record<string, string> = {
        sol: 'sol', solana: 'sol', eth: 'eth', ethereum: 'eth', base: 'base',
        arbitrum: 'arbitrum', arb: 'arbitrum', polygon: 'polygon', matic: 'polygon',
        bnb: 'bnb', bsc: 'bnb', any: 'any',
      };
      return m[String(v ?? '').toLowerCase().trim()] ?? 'any';
    }, z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb', 'any'])).catch('any').optional(),
    scheduledFor:   z.string().optional(),
    url:            z.string().optional(),
    urgency:        z.preprocess(en, z.enum(['live', 'today', 'this_week', 'upcoming'])).catch('upcoming'),
    engagementCount: z.number().transform(n => Math.max(0, Math.round(n))).optional(),
    narrativeTags:  z.array(z.string()).catch([]).optional(),
    ctSentiment:    z.preprocess(en, z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish'])).catch('neutral').optional(),
  })),
});

export type RawXEvent = z.infer<typeof GrokXEventSchema>['events'][0] & {
  source: 'grok';
};

// ── 2-step pipeline: Grok fetches live CT → DeepSeek structures it ────────────

export async function scanXEvents(): Promise<RawXEvent[]> {
  // Step 1: Grok searches X in real-time (generateText — works on DGrid)
  let ctReport = '';
  try {
    const { text } = await generateText({
      model:       dgridNoTemp(MODELS.grok),
      abortSignal: AbortSignal.timeout(40_000),
      prompt: `Search X (Twitter) right now for the most important crypto events in the last 12-24 hours. Cover all 8 categories:

1. SPACES — Live or upcoming X Spaces from crypto KOLs. Include: host handle, topic, live now or scheduled time.
2. VIRAL THREADS — Threads with >500 likes/RTs in last 6-12h. Include: author, engagement count, what it says.
3. KOL ALERTS — Posts from KOLs with >50K followers about specific tokens/positions. Include: handle, follower count, token, what they're saying.
4. AIRDROPS — Live or upcoming claimable airdrops. Include: project, chain, how to claim, deadline.
5. TOKEN UNLOCKS — Unlock events today or this week (>3% circulating supply). Include: ticker, unlock %, when, likely impact.
6. LISTINGS — New CEX listing announcements (Binance, Coinbase, OKX, Bybit, Kraken). Include: exchange, token, when.
7. NARRATIVE SHIFTS — What topics are dominating CT right now? What is the whole space talking about?
8. WHALE MOVES — Large on-chain movements or whale accumulation/distribution signals on-chain.

Be specific: use real handles, real tickers, real dates, real engagement numbers. This data feeds a live crypto intelligence dashboard.`,
    });
    ctReport = text;
  } catch (err) {
    console.error('[sources/x-events] Grok step-1 failed:', err);
    return [];
  }

  if (!ctReport.trim()) return [];

  // Step 2: DeepSeek parses Grok's real CT report into structured schema
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),
      schema:      GrokXEventSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `Parse the following real-time Crypto Twitter intelligence report (fetched from Grok's live X search) into structured events.

LIVE CT REPORT:
${ctReport}

Rules:
- Only extract events explicitly mentioned in the report above — no hallucinations
- urgency: "live" = happening now, "today" = within 24h, "this_week" = 2-7 days, "upcoming" = >7 days
- ctSentiment: CT mood around this specific event
- narrativeTags: macro themes this event belongs to (e.g. "AI x Crypto", "RWA", "L2 wars")
- Extract as many discrete events as possible (up to 40)`,
    });

    return object.events.map((e) => ({ ...e, source: 'grok' as const }));
  } catch (err) {
    console.error('[sources/x-events] DeepSeek step-2 failed:', err);
    return [];
  }
}

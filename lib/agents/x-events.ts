import { generateText } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { scanXEvents, type RawXEvent } from '@/lib/sources/x-events';

// ── Output schema ─────────────────────────────────────────────────────────────

const en = (v: unknown) => String(v ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

export const XEventSchema = z.object({
  type:           z.preprocess(en, z.enum(['space', 'viral_thread', 'kol_alert', 'airdrop', 'token_unlock', 'listing', 'narrative_shift', 'whale_move'])).catch('kol_alert'),
  title:          z.string(),
  description:    z.string().transform(s => s.slice(0, 300)),
  kolHandle:      z.string().optional(),
  followersCount: z.number().transform(n => Math.max(0, Math.round(n))).optional(),
  ticker:         z.string().optional(),
  chain:          z.preprocess(v => {
    const m: Record<string, string> = {
      sol: 'sol', solana: 'sol', eth: 'eth', ethereum: 'eth',
      base: 'base', arbitrum: 'arbitrum', arb: 'arbitrum',
      polygon: 'polygon', matic: 'polygon', bnb: 'bnb', bsc: 'bnb', any: 'any',
    };
    return m[String(v ?? '').toLowerCase().trim()] ?? 'any';
  }, z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb', 'any'])).catch('any').optional(),
  scheduledFor:   z.string().optional(),
  url:            z.string().optional(),
  urgency:        z.preprocess(en, z.enum(['live', 'today', 'this_week', 'upcoming'])).catch('upcoming'),
  engagementCount: z.number().transform(n => Math.max(0, Math.round(n))).optional(),
  narrativeTags:   z.array(z.string()).catch([]).optional(),
  ctSentiment:     z.preprocess(en, z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish'])).catch('neutral').optional(),

  relevanceScore:  z.number().transform(n => Math.max(1, Math.min(10, Math.round(n)))),
  relevanceReason: z.string().transform(s => s.slice(0, 200)),
  actionable:      z.boolean().catch(false),
  actionSummary:   z.string().transform(s => s.slice(0, 200)),

  priceImpact:  z.preprocess(en, z.enum(['bullish', 'bearish', 'neutral', 'unknown'])).catch('unknown'),
  impactReason: z.string().transform(s => s.slice(0, 150)),

  source: z.string(),
});

export type XEvent = z.infer<typeof XEventSchema>;

// ── Score + enrich each event ─────────────────────────────────────────────────

async function scoreEvent(raw: RawXEvent, _grokContext: string): Promise<XEvent | null> {
  try {
    const { text } = await generateText({
      model:       dgrid(MODELS.classifier),
      abortSignal: AbortSignal.timeout(45_000),
      prompt: `You are a crypto market analyst. Score this X event and reply with ONLY a valid JSON object. No markdown fences, no explanation.

EVENT DATA:
Type: ${raw.type} | Title: ${raw.title}
KOL: ${raw.kolHandle ?? 'none'} (${raw.followersCount ?? '?'} followers)
Token: ${raw.ticker ?? 'n/a'} | Chain: ${raw.chain ?? 'any'}
Urgency: ${raw.urgency} | Scheduled: ${raw.scheduledFor ?? 'now'}
Engagement: ${raw.engagementCount ?? '?'} likes/RTs
Description: ${raw.description}
URL: ${raw.url ?? 'none'}

REQUIRED JSON FIELDS (exact names and allowed values):
- type: must be one of "space" "viral_thread" "kol_alert" "airdrop" "token_unlock" "listing" "narrative_shift" "whale_move"
- title: string (the event title)
- description: string (max 250 chars)
- urgency: must be one of "live" "today" "this_week" "upcoming"
- relevanceScore: integer 1-10 (10=Binance listing/top KOL, 7-9=major event, 4-6=moderate, 1-3=low signal)
- relevanceReason: string (max 150 chars, why this score)
- actionable: boolean (true if user can do something concrete now)
- actionSummary: string (one concrete action sentence, max 150 chars)
- priceImpact: must be one of "bullish" "bearish" "neutral" "unknown"
- impactReason: string (max 100 chars)
- ctSentiment: must be one of "very_bullish" "bullish" "neutral" "bearish" "very_bearish"
- narrativeTags: array of strings (macro themes, can be empty)
- source: "${raw.source}"

Optional fields (use null if unknown):
- kolHandle, followersCount, ticker, chain, scheduledFor, url, engagementCount`,
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.error('[x-events] no JSON for', raw.title); return null; }

    let obj: Record<string, unknown>;
    try { obj = JSON.parse(match[0]); }
    catch (e) { console.error('[x-events] JSON.parse failed', e); return null; }

    const parsed = XEventSchema.safeParse(obj);
    if (!parsed.success) {
      console.error('[x-events] schema failed for', raw.title, JSON.stringify(parsed.error.issues[0]));
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.error('[x-events] scoreEvent failed:', err);
    return null;
  }
}

// ── Main scan ─────────────────────────────────────────────────────────────────

export async function runXEventsScan(): Promise<{ events: XEvent[]; scanned: number }> {
  const rawEvents = await scanXEvents();
  console.log(`[x-events] source returned: ${rawEvents.length} events`);

  // Deduplicate by title prefix
  const seen = new Set<string>();
  const unique: RawXEvent[] = [];
  for (const e of rawEvents) {
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    if (!seen.has(key)) { seen.add(key); unique.push(e); }
  }

  // Cap at 8, analyze all in parallel — no second Grok call (saves credits)
  const toScore = unique.slice(0, 8);
  console.log(`[x-events] scoring ${toScore.length} events`);

  const results = await Promise.allSettled(toScore.map((e) => scoreEvent(e, '')));
  const events: XEvent[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) events.push(r.value);
  }

  console.log(`[x-events] scoring done: ${events.length} events produced`);

  // Sort: urgency first, then relevance
  const urgencyOrder: Record<XEvent['urgency'], number> = {
    live: 0, today: 1, this_week: 2, upcoming: 3,
  };
  events.sort((a, b) => {
    const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    return uDiff !== 0 ? uDiff : b.relevanceScore - a.relevanceScore;
  });

  return { events, scanned: rawEvents.length };
}

import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { scanXEvents, type RawXEvent } from '@/lib/sources/x-events';

// ── Output schema ─────────────────────────────────────────────────────────────

export const XEventSchema = z.object({
  type:           z.enum(['space', 'viral_thread', 'kol_alert', 'airdrop', 'token_unlock', 'listing', 'narrative_shift', 'whale_move']),
  title:          z.string(),
  description:    z.string().max(300),
  kolHandle:      z.string().optional(),
  followersCount: z.number().int().min(0).optional(),
  ticker:         z.string().optional(),
  chain:          z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb', 'any']).optional(),
  scheduledFor:   z.string().optional(),
  url:            z.string().optional(),
  urgency:        z.enum(['live', 'today', 'this_week', 'upcoming']),
  engagementCount: z.number().int().min(0).optional(),
  narrativeTags:   z.array(z.string()).max(4).optional(),
  ctSentiment:     z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']).optional(),

  relevanceScore:  z.number().int().min(1).max(10),
  relevanceReason: z.string().max(200),
  actionable:      z.boolean(),
  actionSummary:   z.string().max(200),

  priceImpact:  z.enum(['bullish', 'bearish', 'neutral', 'unknown']),
  impactReason: z.string().max(150),

  source: z.string(),
});

export type XEvent = z.infer<typeof XEventSchema>;

// ── Score + enrich each event ─────────────────────────────────────────────────

async function scoreEvent(raw: RawXEvent, grokContext: string): Promise<XEvent | null> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),
      schema:      XEventSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `Score and enrich this crypto X event for a serious crypto trader.

LIVE GROK CONTEXT (X search right now — use this to verify/enrich the event):
${grokContext || 'No additional live context.'}


Event type: ${raw.type}
Title: ${raw.title}
Description: ${raw.description}
KOL handle: ${raw.kolHandle ?? 'n/a'} (${raw.followersCount ? raw.followersCount.toLocaleString() + ' followers' : 'unknown followers'})
Token: ${raw.ticker ?? 'n/a'} on ${raw.chain ?? 'unknown chain'}
Urgency: ${raw.urgency}
Scheduled: ${raw.scheduledFor ?? 'not specified'}
Engagement: ${raw.engagementCount ? raw.engagementCount.toLocaleString() + ' likes/RTs' : 'unknown'}
URL: ${raw.url ?? 'none'}

── RELEVANCE SCORE (1-10) ──
10: Critical alpha — immediate price catalyst or rare opportunity (Binance listing, top-5 KOL entry, live high-alpha Space)
8-9: High value — significant KOL call, major unlock, high-engagement thread with real data
6-7: Useful — interesting thread, mid-tier KOL, upcoming listing, airdrop with decent protocol
4-5: Moderate — airdrop from unknown protocol, small KOL, general discussion thread
1-3: Low signal — vague content, tiny accounts, no specific alpha

── ACTIONABLE ──
true if there is something concrete the user can DO right now (claim airdrop, watch Space, add to watchlist, set alert, take a position)
false if it's purely informational with no near-term action

── ACTION SUMMARY ──
One concrete sentence: "Claim at [url] before [date]", "Watch the Space live", "Set a sell alert for $TOKEN — unlock in 3 days", etc.

── PRICE IMPACT ──
bullish: positive catalyst (listing, KOL buy, positive unlock news, airdrop for holders)
bearish: negative catalyst (large unlock, KOL selling, negative thread)
neutral: no direct price impact
unknown: unclear

Be precise and realistic. Most events are 4-6 relevance.`,
    });

    return { ...object, source: raw.source };
  } catch (err) {
    console.error('[x-events] scoreEvent failed:', err);
    return null;
  }
}

// ── Main scan ─────────────────────────────────────────────────────────────────

export async function runXEventsScan(): Promise<{ events: XEvent[]; scanned: number }> {
  const rawEvents = await scanXEvents();

  // Deduplicate by title prefix
  const seen = new Set<string>();
  const unique: RawXEvent[] = [];
  for (const e of rawEvents) {
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    if (!seen.has(key)) { seen.add(key); unique.push(e); }
  }

  // Single Grok call — live CT verification before scoring
  let grokContext = '';
  if (unique.length > 0) {
    const titles = unique.slice(0, 15).map((e) => `- ${e.type}: ${e.title}`).join('\n');
    try {
      const { text } = await generateText({
        model:       dgridNoTemp(MODELS.grok),
        abortSignal: AbortSignal.timeout(40_000),
        prompt: `Search X (Twitter) right now to verify and enrich these crypto events. For each, confirm if it's real/trending and add any missing details:

${titles}

For each event: is it confirmed on X? Current engagement? Any updates or corrections? Any related KOL posts I should know about? Keep it brief.`,
      });
      grokContext = text;
    } catch (err) {
      console.error('[x-events] Grok enrichment failed:', err);
    }
  }

  // Score in batches of 4, with live Grok context
  const events: XEvent[] = [];
  for (let i = 0; i < unique.length; i += 4) {
    const batch   = unique.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((e) => scoreEvent(e, grokContext)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) events.push(r.value);
    }
  }

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

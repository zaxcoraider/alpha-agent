import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// ── Raw event schema from Grok ────────────────────────────────────────────────

const XEventType = z.enum([
  'space', 'viral_thread', 'kol_alert', 'airdrop', 'token_unlock', 'listing',
  'narrative_shift', 'whale_move',
]);

const GrokXEventSchema = z.object({
  events: z.array(z.object({
    type:           XEventType,
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
    narrativeTags:  z.array(z.string()).max(4).optional(), // e.g. ["AI x Crypto", "RWA", "DeSci"]
    ctSentiment:    z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']).optional(),
  })).max(40),
});

export type RawXEvent = z.infer<typeof GrokXEventSchema>['events'][0] & {
  source: 'grok';
};

// ── Grok multi-category scan ──────────────────────────────────────────────────

export async function scanXEvents(): Promise<RawXEvent[]> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),  // deepseek-v3.2 — confirmed working for generateObject
      schema:      GrokXEventSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `You are a crypto intelligence agent. Based on your knowledge of Crypto Twitter (CT) and recent crypto events, generate the most important and actionable X (Twitter) events across 8 categories. Focus on the last 12-24 hours.

── CATEGORY 1: SPACES (type: "space") ──
Live or upcoming X Spaces from major crypto KOLs and projects.
Include: host handle, topic, whether live NOW or scheduled, follower count.
Priority: Alpha calls, trading signals, project reveals, deal announcements.

── CATEGORY 2: VIRAL THREADS (type: "viral_thread") ──
Threads with high engagement (>500 likes/RTs) in the last 6-12 hours.
Include: author handle, follower count, engagement count.
Priority: Alpha calls, trade setups, data reveals, narrative shifts.

── CATEGORY 3: KOL ALERTS (type: "kol_alert") ──
Notable posts from major KOLs (>50K followers) about specific tokens/positions.
Include: handle, follower count, what they're saying, which token.
Priority: New position calls, warnings, top/bottom calls, wallet moves.

── CATEGORY 4: AIRDROPS (type: "airdrop") ──
Live or upcoming airdrops that are claimable or registerable.
Include: project name, chain, how to claim, deadline if known.
Priority: Protocols with real usage, upcoming TGEs, retroactive drops.

── CATEGORY 5: TOKEN UNLOCKS (type: "token_unlock") ──
Significant unlock events today or this week (>3% of circulating supply).
Include: token/ticker, unlock %, when it happens, likely price impact.

── CATEGORY 6: EXCHANGE LISTINGS (type: "listing") ──
Upcoming or just-announced CEX listings (Binance, Coinbase, OKX, Bybit, Kraken).
Include: which exchange, which token, when.

── CATEGORY 7: NARRATIVE SHIFTS (type: "narrative_shift") ──
Topics dominating CT right now — what is the entire space talking about?
Examples: "AI x Crypto narrative exploding", "RWA season starting", "DeSci trending", "L2 wars reignited"
Include: the narrative, why it's shifting now, which tokens benefit.
narrativeTags: list the top narratives (e.g. ["AI x Crypto", "RWA", "DeSci", "Restaking"])

── CATEGORY 8: WHALE MOVES (type: "whale_move") ──
Large on-chain wallet movements, whale accumulation/distribution signals.
Include: which wallet (if known), which token, direction (buy/sell), approximate amount.

For ALL events:
- urgency: "live" = happening now, "today" = within 24h, "this_week" = 2-7 days, "upcoming" = >7 days
- ctSentiment: overall CT sentiment around this specific event
- narrativeTags: 1-4 tags describing which macro narratives this event relates to
- Be specific — include real handles, real tickers, real dates
- Generate at least 20 events covering all categories`,
    });

    return object.events.map((e) => ({ ...e, source: 'grok' as const }));
  } catch {
    return [];
  }
}

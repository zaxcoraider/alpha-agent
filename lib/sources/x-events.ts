import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// ── Raw event schema from Grok ────────────────────────────────────────────────

const XEventType = z.enum([
  'space', 'viral_thread', 'kol_alert', 'airdrop', 'token_unlock', 'listing',
]);

const GrokXEventSchema = z.object({
  events: z.array(z.object({
    type:           XEventType,
    title:          z.string(),
    description:    z.string().max(300),
    kolHandle:      z.string().optional(),  // X handle (no @)
    followersCount: z.number().int().min(0).optional(),
    ticker:         z.string().optional(),  // $BTC, $SOL etc.
    chain:          z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb', 'any']).optional(),
    scheduledFor:   z.string().optional(),  // ISO-8601 date/time if known
    url:            z.string().optional(),
    urgency:        z.enum(['live', 'today', 'this_week', 'upcoming']),
    engagementCount: z.number().int().min(0).optional(), // likes/RTs for viral threads
  })).max(30),
});

export type RawXEvent = z.infer<typeof GrokXEventSchema>['events'][0] & {
  source: 'grok';
};

// ── Grok multi-category scan ──────────────────────────────────────────────────

export async function scanXEvents(): Promise<RawXEvent[]> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.grok),
      schema:      GrokXEventSchema,
      abortSignal: AbortSignal.timeout(40_000),
      prompt: `You have real-time access to X (Twitter). Scan Crypto Twitter RIGHT NOW for the most important and actionable X events across 6 categories. Focus on the last 12 hours.

── CATEGORY 1: SPACES (type: "space") ──
Find upcoming or live Twitter/X Spaces from crypto KOLs and projects.
- Search: "Spaces" OR "going live" from accounts with >50K followers in last 4 hours
- Include: host handle, topic, whether live NOW or scheduled
- Priority: anything with Alpha, trading signals, project reveals, or deal announcements

── CATEGORY 2: VIRAL THREADS (type: "viral_thread") ──
Find threads that are rapidly gaining engagement (not just old viral content).
- Search: crypto threads with >500 likes/RTs in the last 6 hours
- Include: author handle, follower count, engagement count (likes + RTs)
- Priority: threads with specific alpha calls, trade setups, narrative shifts, or data reveals

── CATEGORY 3: KOL ALERTS (type: "kol_alert") ──
Find notable posts from major KOLs (>50K followers) about specific tokens/positions.
- Search: any KOL announcing a new position, warning about a project, calling a top/bottom
- Include: their handle, follower count, what they're saying, which token
- Priority: wallet moves + X posts combined, or KOLs who've been right recently

── CATEGORY 4: AIRDROPS (type: "airdrop") ──
Find live or upcoming airdrop opportunities that are claimable or registerable.
- Search: "airdrop" + "claim" OR "eligible" OR "check" + recent
- Include: project name, chain, how to claim, deadline if known
- Priority: airdrops for protocols with real usage (not obvious spam/phishing)

── CATEGORY 5: TOKEN UNLOCKS (type: "token_unlock") ──
Find significant token unlock events happening today or this week.
- Search: "token unlock" OR "vesting" OR "cliff" + project name + date
- Include: token/ticker, unlock amount (% of supply), when it happens
- Priority: unlocks >3% of circulating supply — these create sell pressure

── CATEGORY 6: EXCHANGE LISTINGS (type: "listing") ──
Find upcoming or just-announced CEX listings (especially Binance, Coinbase, OKX, Bybit, Kraken).
- Search: "listing" OR "will list" OR "now trading" + exchange name
- Include: which exchange, which token, when (today/this week)
- Priority: Binance and Coinbase listings are massive price catalysts

For ALL events:
- urgency: "live" = happening now, "today" = within 24h, "this_week" = 2-7 days, "upcoming" = >7 days
- Be specific — include real handles, real tickers, real dates where known
- Skip duplicates and unverified rumors without any signal`,
    });

    return object.events.map((e) => ({ ...e, source: 'grok' as const }));
  } catch {
    return [];
  }
}

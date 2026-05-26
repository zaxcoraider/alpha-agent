import { generateObject } from 'ai';
import { z } from 'zod';
import { dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// ── Output schemas ────────────────────────────────────────────────────────────

export const IdeaSchema = z.object({
  type:         z.enum(['build', 'trade', 'narrative']),
  title:        z.string(),
  tldr:         z.string().max(160),
  body:         z.string().max(500),
  sources:      z.array(z.string()),          // which agent feeds surfaced signals
  chains:       z.array(z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb'])),
  tickers:      z.array(z.string()),
  timeHorizon:  z.enum(['now', 'days', 'weeks', 'months']),
  conviction:   z.number().int().min(1).max(10),
  risk:         z.enum(['low', 'medium', 'high']),
  tags:         z.array(z.string()).max(5),
  actionItems:  z.array(z.string()).max(4),
});

export const WeeklyReportSchema = z.object({
  headline:      z.string(),
  topNarrative:  z.string().max(400),
  topBuildOpp:   z.string().max(300),
  topTradeSetup: z.string().max(300),
  watchlist:     z.array(z.string()).max(8),
  risks:         z.array(z.string()).max(5),
  generatedAt:   z.string(),
});

const IdeasBatchSchema = z.object({
  ideas:        z.array(IdeaSchema).max(15),
  weeklyReport: WeeklyReportSchema,
});

export type Idea = z.infer<typeof IdeaSchema>;
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
export type IdeasBatch = z.infer<typeof IdeasBatchSchema>;

// ── Main synthesis ────────────────────────────────────────────────────────────

export async function runIdeasSynthesis(contextSummary: string): Promise<IdeasBatch> {
  const { object } = await generateObject({
    model:       dgridNoTemp(MODELS.reasoner), // Claude Opus 4.7 — synthesis needs best model
    schema:      IdeasBatchSchema,
    abortSignal: AbortSignal.timeout(60_000),
    prompt: `You are the Alpha Synthesizer — a senior crypto strategist who reads signals from multiple intelligence feeds and distills them into high-conviction ideas.

Here is the latest intelligence snapshot from all scanners (last 24 hours):

${contextSummary}

── YOUR TASK ──
Generate a batch of actionable ideas across 3 types, PLUS a Weekly Alpha Report.
Base every idea on signals from the snapshot above — no hallucinations, no generic advice.

── BUILD IDEAS (type: "build") — up to 5 ──
Products, tools, protocols, or bots to build RIGHT NOW based on market gaps and narrative momentum.
Each idea must reference a specific signal from the snapshot (e.g. "NFT mints scanner found high KOL velocity on Solana cNFTs → build a cNFT batch minter").
Score conviction based on: urgency of opportunity, market size signal, how underserved the niche is.
actionItems: concrete first 4 steps to start building today.

── TRADE IDEAS (type: "trade") — up to 5 ──
Specific trade setups with entry thesis, based on cross-signal confirmation.
Ideal: a meme with high CT velocity + matching KOL alert + narrative play = high-conviction trade.
Include: which token, which chain, what's the catalyst, time horizon, risk.
actionItems: what to do specifically (e.g. "Set alert at $X mcap, buy small on confirmed breakout above $Y").

── NARRATIVE PLAYS (type: "narrative") — up to 5 ──
Meta-level narrative shifts happening right now that create multi-week opportunities.
E.g. "AI agent tokens surging across 3 chains simultaneously — early signals of a coordinated narrative pump".
These are positioning ideas: get in front of a narrative before it fully matures.
actionItems: how to position yourself (tokens to watch, sectors to monitor, content to create).

── CONVICTION SCORING (1-10) ──
10: Multiple independent signals all pointing the same direction (rare)
8-9: Strong cross-signal confirmation from 2+ agents
6-7: Single strong signal with solid fundamentals
4-5: Interesting but limited signal confirmation
1-3: Speculative or low-confidence

── WEEKLY ALPHA REPORT ──
Synthesize the snapshot into a weekly brief:
- headline: 1 punchy sentence summarizing the week's biggest theme
- topNarrative: what meta-narrative is dominating and why (2-3 sentences)
- topBuildOpp: the single best thing to build this week (2-3 sentences)
- topTradeSetup: the highest-conviction trade setup right now (2-3 sentences)
- watchlist: up to 8 tokens/projects to watch closely
- risks: up to 5 macro or specific risks to the above thesis

Be concrete, be specific, reference actual signals. If signals are thin, say so in the body.`,
  });

  return object;
}

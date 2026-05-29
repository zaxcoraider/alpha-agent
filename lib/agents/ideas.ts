import { generateObject } from 'ai';
import { z } from 'zod';
import { dgridNoTemp } from '@/lib/llm/client';
import { MODELS, AGENT_MODELS } from '@/lib/llm/models';

// ── Output schemas ────────────────────────────────────────────────────────────

export const IdeaSchema = z.object({
  type:         z.enum(['build', 'trade', 'narrative']),
  title:        z.string(),
  tldr:         z.string().max(160),
  body:         z.string().max(500),
  sources:      z.array(z.string()),
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

const SectionBatchSchema = z.object({
  ideas: z.array(IdeaSchema).max(6),
});

// Kept for backward compatibility with any code importing this name.
const IdeasBatchSchema = z.object({
  ideas:        z.array(IdeaSchema).max(15),
  weeklyReport: WeeklyReportSchema,
});

export type Idea = z.infer<typeof IdeaSchema>;
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
export type IdeasBatch = z.infer<typeof IdeasBatchSchema>;

// ── Conviction scale (shared prompt fragment) ────────────────────────────────

const CONVICTION_SCALE = `── CONVICTION SCORING (1-10) ──
10: Multiple independent signals all pointing the same direction (rare)
8-9: Strong cross-signal confirmation from 2+ agents
6-7: Single strong signal with solid fundamentals
4-5: Interesting but limited signal confirmation
1-3: Speculative or low-confidence`;

// ── Build Ideas synthesis ────────────────────────────────────────────────────

export async function runBuildIdeasSynthesis(contextSummary: string): Promise<{ ideas: Idea[] }> {
  const { object } = await generateObject({
    model:       dgridNoTemp(MODELS.reasoner), // Claude Opus 4.7
    schema:      SectionBatchSchema,
    abortSignal: AbortSignal.timeout(55_000),
    prompt: `You are the Alpha Synthesizer — a senior crypto strategist. Read the intelligence snapshot and generate Build Ideas only.

INTELLIGENCE SNAPSHOT (last 24h):
${contextSummary}

── BUILD IDEAS (type: "build") — up to 5 ──
Products, tools, protocols, or bots to build RIGHT NOW based on market gaps and narrative momentum.
Each idea must reference a specific signal from the snapshot (e.g. "NFT mints scanner found high KOL velocity on Solana cNFTs → build a cNFT batch minter").
Score conviction based on: urgency of opportunity, market size signal, how underserved the niche is.
actionItems: concrete first 4 steps to start building today.

All ideas must have type = "build". Be concrete, reference actual signals. If signals are thin, say so in the body.

${CONVICTION_SCALE}`,
  });
  return { ideas: object.ideas };
}

// ── Trade Ideas synthesis ────────────────────────────────────────────────────

export async function runTradeIdeasSynthesis(contextSummary: string): Promise<{ ideas: Idea[] }> {
  // o3-pro for Trade Ideas — the single most consequential daily decision in
  // the dashboard ("what should I trade"). o3-pro is a reasoning model and
  // does NOT accept temperature, hence dgridNoTemp. Latency can exceed Vercel
  // Hobby's 60s cap; on Hobby this call may time out and the section will
  // gracefully render empty (caller wraps in .catch).
  const { object } = await generateObject({
    model:       dgridNoTemp(AGENT_MODELS.trade_ideas),
    schema:      SectionBatchSchema,
    abortSignal: AbortSignal.timeout(110_000),
    prompt: `You are the Alpha Synthesizer — a senior crypto strategist. Read the intelligence snapshot and generate Trade Ideas only.

INTELLIGENCE SNAPSHOT (last 24h):
${contextSummary}

── TRADE IDEAS (type: "trade") — up to 5 ──
Specific trade setups with entry thesis, based on cross-signal confirmation.
Ideal: a meme with high CT velocity + matching KOL alert + narrative play = high-conviction trade.
Include: which token, which chain, what's the catalyst, time horizon, risk.
actionItems: what to do specifically (e.g. "Set alert at $X mcap, buy small on confirmed breakout above $Y").

All ideas must have type = "trade". Be concrete, reference actual signals from the snapshot.

${CONVICTION_SCALE}`,
  });
  return { ideas: object.ideas };
}

// ── Narrative Plays synthesis ────────────────────────────────────────────────

export async function runNarrativeSynthesis(contextSummary: string): Promise<{ ideas: Idea[] }> {
  const { object } = await generateObject({
    model:       dgridNoTemp(MODELS.reasoner),
    schema:      SectionBatchSchema,
    abortSignal: AbortSignal.timeout(55_000),
    prompt: `You are the Alpha Synthesizer — a senior crypto strategist. Read the intelligence snapshot and generate Narrative Plays only.

INTELLIGENCE SNAPSHOT (last 24h):
${contextSummary}

── NARRATIVE PLAYS (type: "narrative") — up to 5 ──
Meta-level narrative shifts happening right now that create multi-week opportunities.
E.g. "AI agent tokens surging across 3 chains simultaneously — early signals of a coordinated narrative pump".
These are positioning ideas: get in front of a narrative before it fully matures.
actionItems: how to position yourself (tokens to watch, sectors to monitor, content to create).

All ideas must have type = "narrative". Be concrete, reference actual signals from the snapshot.

${CONVICTION_SCALE}`,
  });
  return { ideas: object.ideas };
}

// ── Weekly Alpha Report ──────────────────────────────────────────────────────

export async function runWeeklyReport(contextSummary: string): Promise<{ report: WeeklyReport }> {
  const { object } = await generateObject({
    model:       dgridNoTemp(MODELS.reasoner),
    schema:      WeeklyReportSchema,
    abortSignal: AbortSignal.timeout(55_000),
    prompt: `You are the Alpha Synthesizer. Read the week's intelligence snapshot and produce the Weekly Alpha Report.

INTELLIGENCE SNAPSHOT (last 24h):
${contextSummary}

── WEEKLY ALPHA REPORT ──
- headline: 1 punchy sentence summarizing the week's biggest theme
- topNarrative: what meta-narrative is dominating and why (2-3 sentences)
- topBuildOpp: the single best thing to build this week (2-3 sentences)
- topTradeSetup: the highest-conviction trade setup right now (2-3 sentences)
- watchlist: up to 8 tokens/projects to watch closely
- risks: up to 5 macro or specific risks to the above thesis
- generatedAt: ISO date string for today

Reference actual signals. No hallucinations.`,
  });
  return { report: object };
}

// ── Backwards-compat: runs all 4 sequentially (for VPS/Inngest where 60s doesn't apply) ──

export async function runIdeasSynthesis(contextSummary: string): Promise<IdeasBatch> {
  const [build, trade, narrative, weekly] = await Promise.all([
    runBuildIdeasSynthesis(contextSummary).catch(() => ({ ideas: [] as Idea[] })),
    runTradeIdeasSynthesis(contextSummary).catch(() => ({ ideas: [] as Idea[] })),
    runNarrativeSynthesis(contextSummary).catch(() => ({ ideas: [] as Idea[] })),
    runWeeklyReport(contextSummary).catch(() => null),
  ]);
  return {
    ideas:        [...build.ideas, ...trade.ideas, ...narrative.ideas],
    weeklyReport: weekly?.report ?? {
      headline: 'Weekly report unavailable',
      topNarrative: '', topBuildOpp: '', topTradeSetup: '',
      watchlist: [], risks: [], generatedAt: new Date().toISOString(),
    },
  };
}

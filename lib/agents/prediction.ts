import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import {
  AGENT_MODELS,
  PREDICTION_ANALYSTS,
  PREDICTION_CHEAP_POOL,
  type AnalystRole,
} from '@/lib/llm/models';
import { fetchActiveMarkets, type ParsedMarket } from '@/lib/sources/polymarket';
import { fetchKalshiMarkets } from '@/lib/sources/kalshi';
import { buildPredictionContext, formatContextBlock } from '@/lib/sources/prediction-context';
import { runMiroFishAnalysis, type MiroFishResult } from '@/lib/sources/mirofish';

// ─── Predict mode ────────────────────────────────────────────────────────────

export type PredictMode = 'both' | 'analysts_only' | 'mirofish_only';

// ─── Final output schema (stored in DB) ──────────────────────────────────────

export const PredictionSchema = z.object({
  marketId: z.string(),
  question: z.string(),
  marketProb: z.number().min(0).max(1),
  yourProb: z.number().min(0).max(1),
  edge: z.number().min(0).max(1),
  recommendedSide: z.enum(['YES', 'NO', 'SKIP']),
  confidence: z.number().min(0).max(1),
  keyEvidence: z.array(z.string()).max(5),
  reasoning: z.string().max(800),
  volumeUsd: z.number(),
  endDate: z.string(),
  daysLeft: z.number(),
  analystCount: z.number(),
  analystBreakdown: z.array(z.object({
    role: z.string(),
    yourProb: z.number(),
    confidence: z.number(),
    headline: z.string(),
  })).optional(),
  miroFishEnhanced: z.boolean().optional(),
  miroFishAgentCount: z.number().optional(),
  miroFishMeanProb: z.number().min(0).max(1).optional(),
  miroFishStdDev: z.number().min(0).max(1).optional(),
  source: z.enum(['polymarket', 'kalshi', 'metaculus']).optional(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

// ─── Analyst output schema ────────────────────────────────────────────────────

const AnalystSchema = z.object({
  yourProb: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  headline: z.string(),
  evidence: z.array(z.string()),
});

type AnalystOpinion = z.infer<typeof AnalystSchema> & { role: string };

// ─── Aggregator schema ────────────────────────────────────────────────────────

const AggregatorSchema = z.object({
  consensusProb: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  keyEvidence: z.array(z.string()).max(5),
  reasoning: z.string(),
});

// ─── 12-analyst ensemble ──────────────────────────────────────────────────────
// Analyst pool + per-frame model selection lives in lib/llm/models.ts as
// PREDICTION_ANALYSTS / PREDICTION_CHEAP_POOL. Each analyst has its own
// specialist model picked for the frame they represent (Opus for rug detection,
// o3 for quant frames, R1 for microstructure reasoning, Grok variants for live
// X data, etc).
//
// Rich lens prompts (the analyst's "voice") stay here keyed by analyst.id so
// the prompts can evolve independently of model selection.

const ANALYST_LENS: Record<string, string> = {
  macro:            'Focus on macro-economic trends, policy cycles, interest rates, DXY, BTC dominance, and structural forces. How does the current macro regime affect this outcome? Use the 1M-context window to swallow the full macro state, not just the latest headline.',
  base_rate:        'Ignore all narrative. Focus purely on historical base rates: how often do events of this exact reference class resolve YES? Anchor hard to the base rate before any adjustment.',
  risk_tail:        'Focus exclusively on downside risk and black-swan scenarios. What low-probability, high-impact events could force an unexpected resolution? Assign probability mass to these tails explicitly. Do NOT anchor to the base case.',
  nft_floor:        'Focus on NFT floor dynamics, mint pressure, and collector behavior. If this market touches NFT pricing, supply, or mint outcomes, your read dominates. Otherwise contribute a calibrated "low-confidence" estimate.',
  memes_gem:        'Focus on early meme-coin gem signals: CT velocity, KOL accumulation, narrative ignition, and rug-vs-real divergence. Identify early-stage signal that a token thesis is forming.',
  microstructure:   'Analyze market mechanics: volume trends, liquidity depth, bid-ask spread, recent velocity. Is this market efficiently priced or are there signs of informed trading, thin liquidity distortion, or late-money manipulation?',
  fundamentals:     'Assess on-chain and protocol fundamentals: TVL trends, developer activity, token unlock schedules, exchange inflow/outflow, whale movements, and protocol revenue. Cover Asian crypto coverage too — multilingual sources matter.',
  crowd_calibrator: 'Calibrate the crowd vs the smart money. Use the Reddit + X signals to assess whether retail is herding ahead of fundamentals, or whether smart-money positioning is quietly diverging from the consensus narrative.',
  consensus:        'Run a parallel multi-agent search across live X data. What do the most-engaged, most-credible CT accounts collectively imply about this outcome? Weight by author credibility, not raw engagement.',
  kol:              'Assess KOL credibility on this specific topic. Which named KOLs have historically been right on questions of this reference class? Weight their current take by that track record — ignore unverified accounts entirely.',
  contrarian:       'Steel-man the case AGAINST the current market consensus. Use live X data to find what the crowd is missing: overlooked factor, tail risk, late-cycle signal that flips this 20%+ away from the market price.',
  rug_red_flags:    'Hunt for subtle rug-risk signals that Sonnet would miss. Examine team doxx state, contract verification, holder concentration, liquidity lock status, and historical patterns of dev wallets. If any flag fires, lower yourProb sharply.',
};

// ─── Run one analyst ──────────────────────────────────────────────────────────
// Each analyst gets its own model from PREDICTION_ANALYSTS. We use dgridNoTemp
// universally because many of the new specialists (Opus, o3, GPT-5.5, R1,
// Kimi K2 Thinking) are reasoning models that reject the temperature parameter.

async function runAnalyst(
  market: ParsedMarket,
  analyst: AnalystRole,
  contextBlock: string,
  poolSize: number,
): Promise<AnalystOpinion | null> {
  const lens = ANALYST_LENS[analyst.id] ?? analyst.focus;
  try {
    const { object } = await generateObject({
      model:       dgridNoTemp(analyst.model),
      schema:      AnalystSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(90_000),  // reasoning models (o3, R1, Kimi) can take 60s+
      prompt: `You are the ${analyst.label} analyst in a ${poolSize}-analyst prediction market ensemble.

MARKET:
- Question: ${market.question}
- Description: ${market.description?.slice(0, 500) || 'No description.'}
- Market Implied Probability (YES): ${(market.yesPrice * 100).toFixed(1)}%
- Volume: $${market.volumeUsd.toLocaleString()} | Liquidity: $${market.liquidityUsd.toLocaleString()}
- Resolves: ${market.endDate} (${market.daysLeft} days left)

${contextBlock}

YOUR SPECIALIST LENS: ${lens}

Apply ONLY your lens above. Use the live intelligence context where relevant to your role.
Output:
- yourProb: YOUR probability estimate for YES (do not blindly anchor to market price)
- confidence: your certainty in this estimate (0.0 = random guess, 1.0 = near certain)
- headline: one crisp sentence summarizing your thesis
- evidence: 2-3 specific bullet points supporting your estimate`,
    });

    return { ...object, role: analyst.label };
  } catch (err) {
    console.error(`[analyst:${analyst.id}] failed:`, err);
    return null;
  }
}

// ─── Chief Analyst aggregation ────────────────────────────────────────────────

async function aggregateOpinions(
  market: ParsedMarket,
  opinions: AnalystOpinion[],
  contextBlock: string,
  miroFish: MiroFishResult | null,
): Promise<z.infer<typeof AggregatorSchema>> {
  const panel = opinions
    .map((o) =>
      `${o.role}: prob=${(o.yourProb * 100).toFixed(0)}%, conf=${(o.confidence * 100).toFixed(0)}%\n  "${o.headline}"`,
    )
    .join('\n');

  // Build the MiroFish section — swarm stats are the quantitative signal, report is the narrative
  let miroSection = '';
  const sw = miroFish?.swarmStats;
  if (sw && sw.sampleSize >= 3) {
    const bullPct  = sw.agentCount > 0 ? ((sw.bullCount / sw.sampleSize) * 100).toFixed(0) : '?';
    const bearPct  = sw.agentCount > 0 ? ((sw.bearCount / sw.sampleSize) * 100).toFixed(0) : '?';
    miroSection = `
━━━ MIROFISH SWARM (${sw.agentCount} agents, ${sw.sampleSize} interviewed, ${SIM_ROUNDS} social simulation rounds) ━━━
Swarm mean probability:   ${(sw.meanProb * 100).toFixed(1)}%
Swarm median:             ${(sw.medianProb * 100).toFixed(1)}%
Disagreement (std dev):   ±${(sw.stdDev * 100).toFixed(1)}%  ${sw.stdDev > 0.2 ? '⚠ HIGH — agents strongly divided' : '✓ agents broadly aligned'}
Sentiment split:          ${bullPct}% bulls (>60%) | ${100 - Number(bullPct) - Number(bearPct)}% neutral | ${bearPct}% bears (<40%)
Market price vs swarm:    market=${(market.yesPrice * 100).toFixed(1)}% | swarm=${(sw.meanProb * 100).toFixed(1)}% | edge=${((sw.meanProb - market.yesPrice) * 100).toFixed(1)}%

Top bull case: ${sw.topBullResponse || 'N/A'}
Top bear case: ${sw.topBearResponse || 'N/A'}
${miroFish?.report ? `\nSwarm report excerpt:\n${miroFish.report.slice(0, 800)}` : ''}`;
  } else if (miroFish?.report) {
    miroSection = `\n━━━ MIROFISH SWARM REPORT ━━━\n${miroFish.report.slice(0, 1200)}\n`;
  }

  const hasSwarm = sw && sw.sampleSize >= 3;

  const { object } = await generateObject({
    model:       dgrid(AGENT_MODELS.prediction_aggregator),
    schema:      AggregatorSchema,
    mode:        'json',
    abortSignal: AbortSignal.timeout(180_000), // r1-0528 reasoning model needs up to 3 min
    prompt: `You are the Chief Analyst synthesizing two independent signals for a prediction market:
1. A ${opinions.length}-member specialist analyst ensemble
${hasSwarm ? `2. A MiroFish swarm of ${sw!.agentCount} AI agents who debated this question in a social simulation` : ''}

MARKET: ${market.question}
Market Implied Probability (YES): ${(market.yesPrice * 100).toFixed(1)}%
Volume: $${market.volumeUsd.toLocaleString()} | Resolves: ${market.endDate} (${market.daysLeft} days)

${contextBlock}
${miroSection}
ANALYST PANEL:
${panel}

SYNTHESIS TASK:
1. Compute a confidence-weighted consensus probability
   - Weight each analyst by their stated confidence
   ${hasSwarm ? `- The swarm mean of ${(sw!.meanProb * 100).toFixed(1)}% is an independent signal from ${sw!.sampleSize} agents — treat it like a ${sw!.sampleSize}-person crowd forecast and weight it heavily` : ''}
   ${hasSwarm && sw!.stdDev > 0.2 ? `- High swarm std dev (±${(sw!.stdDev * 100).toFixed(1)}%) signals genuine uncertainty — lower your confidence accordingly` : ''}
2. Identify where the analyst panel and swarm agree vs. diverge — convergence = higher confidence
3. Synthesize 3-5 most important evidence points from the panel AND live context
4. Write a tight 2-4 sentence investment thesis grounded in the strongest signals

Calibration rules:
- Do NOT over-anchor to market price — the ensemble exists to find edge against it
- If the swarm and analyst panel disagree by >10%, explain why one signal dominates
- Cite specific facts from the live context where they support the thesis`,
  });

  return object;
}

// Round constant for the prompt (must stay in sync with mirofish.ts SIM_MAX_ROUNDS)
const SIM_ROUNDS = 30;

// ─── Full ensemble for one market ────────────────────────────────────────────

export type AnalystPool = 'cheap' | 'full';

export async function analyseMarket(
  market: ParsedMarket,
  miroFish: MiroFishResult | null = null,
  prebuiltContext?: string,  // pass when runPredictionScan already fetched context for MiroFish
  mode: PredictMode = 'both',
  pool: AnalystPool = 'cheap',  // Option B tiering: cheap default, full on top markets only
): Promise<Prediction> {
  // Step 1: fetch live context, or reuse pre-built to avoid double-fetch
  let contextBlock = prebuiltContext ?? '';
  if (!contextBlock) {
    const ctx = await buildPredictionContext(market.question).catch(() => null);
    contextBlock = ctx
      ? formatContextBlock(ctx)
      : '━━━ LIVE MARKET INTELLIGENCE ━━━\nNo context available.';
  }

  // Step 2: run analysts (skip when mirofish_only)
  let opinions: AnalystOpinion[] = [];
  if (mode !== 'mirofish_only') {
    const roster = pool === 'full' ? PREDICTION_ANALYSTS : PREDICTION_CHEAP_POOL;
    const analystResults = await Promise.allSettled(
      roster.map((a) => runAnalyst(market, a, contextBlock, roster.length)),
    );
    opinions = analystResults
      .filter(
        (r): r is PromiseFulfilledResult<AnalystOpinion> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value);

    if (opinions.length === 0) {
      throw new Error(`All analysts failed for market ${market.id}`);
    }
  }

  // When analysts_only, drop any miroFish data even if provided
  const effectiveMiroFish = mode === 'analysts_only' ? null : miroFish;

  if (mode === 'mirofish_only' && (!effectiveMiroFish?.swarmStats || effectiveMiroFish.swarmStats.sampleSize < 3)) {
    throw new Error(`MiroFish swarm returned no usable data for market ${market.id}`);
  }

  // Step 3: aggregate — chief analyst synthesizes whatever signals are available
  const agg = await aggregateOpinions(market, opinions, contextBlock, effectiveMiroFish);

  const edge = Math.abs(agg.consensusProb - market.yesPrice);
  const recommendedSide =
    edge < 0.10 || agg.confidence < 0.60
      ? 'SKIP'
      : agg.consensusProb > market.yesPrice
      ? 'YES'
      : 'NO';

  const sw = effectiveMiroFish?.swarmStats;

  return {
    marketId:    market.id,
    question:    market.question,
    marketProb:  market.yesPrice,
    yourProb:    agg.consensusProb,
    edge,
    recommendedSide,
    confidence:  agg.confidence,
    keyEvidence: agg.keyEvidence,
    reasoning:   agg.reasoning,
    volumeUsd:   market.volumeUsd,
    endDate:     market.endDate,
    daysLeft:    market.daysLeft,
    analystCount: opinions.length,
    miroFishEnhanced:   effectiveMiroFish !== null && (sw !== null || effectiveMiroFish.report !== null),
    miroFishAgentCount: sw?.agentCount,
    miroFishMeanProb:   sw?.meanProb,
    miroFishStdDev:     sw?.stdDev,
    source:      market.source,
    analystBreakdown: opinions.map((o) => ({
      role:      o.role,
      yourProb:  o.yourProb,
      confidence: o.confidence,
      headline:  o.headline,
    })),
  };
}

// ─── Full prediction scan ─────────────────────────────────────────────────────

export async function runPredictionScan(): Promise<{
  predictions: Prediction[];
  scanned: number;
  withEdge: number;
}> {
  // Pull from both exchanges in parallel
  // Production (VPS): 30 Polymarket + 15 Kalshi = 45 markets
  const [polyMarkets, kalshiMarkets] = await Promise.all([
    fetchActiveMarkets({ minVolume: 50_000, maxDaysLeft: 90, limit: 30 }),
    fetchKalshiMarkets({ minVolume: 5_000,  maxDaysLeft: 90, limit: 15 }),
  ]);

  const markets = [...polyMarkets, ...kalshiMarkets].slice(0, 45);

  // Option B budget tiering:
  //   markets [0..2]   → full 12-analyst pool + MiroFish swarm  (highest stakes)
  //   markets [3..4]   → full 12-analyst pool, no MiroFish      (top non-MiroFish)
  //   markets [5..44]  → cheap 4-analyst pool only              (volume coverage)
  const miroFishMarkets = markets.slice(0, 3);
  const fullPoolRest    = markets.slice(3, 5);
  const cheapPoolRest   = markets.slice(5);

  const predictions: Prediction[] = [];

  // Run MiroFish sequentially for top 3 (parallel would overwhelm VPS + Zep)
  for (const m of miroFishMarkets) {
    const ctx          = await buildPredictionContext(m.question).catch(() => null);
    const contextBlock = ctx ? formatContextBlock(ctx) : '━━━ LIVE MARKET INTELLIGENCE ━━━\nNo context available.';
    const miroFish     = await runMiroFishAnalysis(m, contextBlock).catch(() => null);
    const r            = await analyseMarket(m, miroFish, contextBlock, 'both', 'full').catch(() => null);
    if (r) predictions.push(r);
  }

  // Markets 4-5: full pool, no MiroFish
  const fullRestResults = await Promise.allSettled(
    fullPoolRest.map((m) => analyseMarket(m, null, undefined, 'both', 'full')),
  );
  for (const r of fullRestResults) {
    if (r.status === 'fulfilled') predictions.push(r.value);
  }

  // Cheap pool: batches of 5 to keep concurrency reasonable
  for (let i = 0; i < cheapPoolRest.length; i += 5) {
    const batch   = cheapPoolRest.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map((m) => analyseMarket(m, null, undefined, 'both', 'cheap')));
    for (const r of results) {
      if (r.status === 'fulfilled') predictions.push(r.value);
    }
  }

  const withEdge = predictions.filter((p) => p.recommendedSide !== 'SKIP').length;
  return { predictions, scanned: markets.length, withEdge };
}

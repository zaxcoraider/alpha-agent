import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';
import { fetchActiveMarkets, type ParsedMarket } from '@/lib/sources/polymarket';
import { fetchKalshiMarkets } from '@/lib/sources/kalshi';
import { buildPredictionContext, formatContextBlock } from '@/lib/sources/prediction-context';
import { runMiroFishAnalysis } from '@/lib/sources/mirofish';

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
  miroFishEnhanced: z.boolean().optional(), // true if MiroFish swarm ran for this market
  source: z.enum(['polymarket', 'kalshi', 'metaculus']).optional(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

// ─── Analyst output schema ────────────────────────────────────────────────────

const AnalystSchema = z.object({
  yourProb: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  headline: z.string().max(120),
  evidence: z.array(z.string()).max(3),
});

type AnalystOpinion = z.infer<typeof AnalystSchema> & { role: string };

// ─── Aggregator schema ────────────────────────────────────────────────────────

const AggregatorSchema = z.object({
  consensusProb: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  keyEvidence: z.array(z.string()).max(5),
  reasoning: z.string().max(800),
});

// ─── 10-analyst ensemble ──────────────────────────────────────────────────────

const ANALYST_ROLES = [
  {
    role: 'Macro Analyst',
    lens: 'Focus on macro-economic trends, policy cycles, interest rates, and structural forces. How do the current macro regime and global risk sentiment affect this outcome? Calibrate against historical crowd accuracy on macro-driven events.',
  },
  {
    role: 'Base Rate Analyst',
    lens: 'Ignore all narrative. Focus purely on historical base rates: How often do events of this exact type resolve YES? What is the right reference class? Anchor hard to the base rate before any adjustment.',
  },
  {
    role: 'Contrarian Analyst',
    lens: 'Steel-man the case AGAINST the current market consensus. What is the crowd missing? What overlooked factor, tail risk, or contrary evidence shifts the probability significantly away from the market price?',
  },
  {
    role: 'News Catalyst Analyst',
    lens: 'Use the live news context provided. Identify specific upcoming events, scheduled announcements, regulatory decisions, or structural triggers that could shift the resolution before the deadline. Weight catalysts by proximity and magnitude.',
  },
  {
    role: 'Market Microstructure Analyst',
    lens: 'Analyze the market mechanics: volume trends, liquidity depth, bid-ask spread, recent price movement velocity. Is this market efficiently priced or are there signs of informed trading, thin liquidity distortion, or late-money manipulation?',
  },
  {
    role: 'Social Sentiment Analyst',
    lens: 'Use the Reddit and Twitter/X signals provided. Assess crowd psychology: Are retail participants herding? Is there a narrative dominating that the fundamentals don\'t support? What is the social volume trend and sentiment direction vs. 1 week ago?',
  },
  {
    role: 'Political & Regulatory Analyst',
    lens: 'Assess political dynamics, regulatory environment, and institutional behavior. Focus on power structures, incentives of key decision-makers, legislative timelines, and legal/compliance precedents that could force a specific resolution.',
  },
  {
    role: 'Risk & Tail Analyst',
    lens: 'Focus exclusively on downside risk and black-swan scenarios. What low-probability, high-impact events could force an unexpected resolution? Assign probability mass to these tails explicitly. Do NOT anchor to the base case.',
  },
  {
    role: 'Crypto Fundamentals Analyst',
    lens: 'Assess on-chain and protocol fundamentals: TVL trends, developer activity, token unlock schedules, exchange inflow/outflow signals, whale wallet movements, and protocol revenue. Ground your estimate in verifiable on-chain data signals from the news context.',
  },
  {
    role: 'Quantitative Momentum Analyst',
    lens: 'Focus on price momentum, volume patterns, and statistical signals. What does the recent market price trajectory imply about resolution probability? Apply quantitative thinking: trend strength, mean-reversion probability, and volatility-adjusted edge estimation.',
  },
] as const;

// ─── Run one analyst ──────────────────────────────────────────────────────────

async function runAnalyst(
  market: ParsedMarket,
  role: string,
  lens: string,
  contextBlock: string,
): Promise<AnalystOpinion | null> {
  try {
    const { object } = await generateObject({
      model: dgrid(AGENT_MODELS.prediction_analyst), // claude-sonnet-4.6
      schema: AnalystSchema,
      prompt: `You are the ${role} in a 10-analyst prediction market ensemble.

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

    return { ...object, role };
  } catch {
    return null;
  }
}

// ─── Chief Analyst aggregation ────────────────────────────────────────────────

async function aggregateOpinions(
  market: ParsedMarket,
  opinions: AnalystOpinion[],
  contextBlock: string,
  miroFishReport: string | null,
): Promise<z.infer<typeof AggregatorSchema>> {
  const panel = opinions
    .map((o) =>
      `${o.role}: prob=${(o.yourProb * 100).toFixed(0)}%, conf=${(o.confidence * 100).toFixed(0)}%\n  "${o.headline}"`,
    )
    .join('\n');

  const miroSection = miroFishReport
    ? `\n━━━ MIROFISH SWARM SIMULATION (hundreds of agents, emergent consensus) ━━━\n${miroFishReport.slice(0, 1200)}\n`
    : '';

  const { object } = await generateObject({
    model: dgrid(AGENT_MODELS.prediction_aggregator), // claude-opus-4.7
    schema: AggregatorSchema,
    prompt: `You are the Chief Analyst aggregating a ${opinions.length}-member specialist ensemble for a prediction market.${miroFishReport ? ' You also have a MiroFish swarm simulation report from hundreds of emergent agents.' : ''}

MARKET: ${market.question}
Market Implied Probability (YES): ${(market.yesPrice * 100).toFixed(1)}%
Volume: $${market.volumeUsd.toLocaleString()} | Resolves: ${market.endDate} (${market.daysLeft} days)

${contextBlock}
${miroSection}
ANALYST PANEL:
${panel}

TASK:
1. Compute a confidence-weighted consensus probability (weight each analyst's estimate by their stated confidence)
2. Identify where analysts agree vs. sharply diverge — high divergence lowers consensus confidence
3. Synthesize the 3-5 most important evidence points from across the panel AND the live context
4. Write a tight 2-4 sentence investment thesis grounded in the strongest signals

Calibration rules:
- If analysts are highly split (>20% spread), lower confidence to reflect genuine uncertainty
- Do NOT over-anchor to the market price — the ensemble exists to find disagreement with it
- Cite specific facts from the live context where they support the thesis`,
  });

  return object;
}

// ─── Full ensemble for one market ────────────────────────────────────────────

export async function analyseMarket(
  market: ParsedMarket,
  miroFishReport: string | null = null,
): Promise<Prediction> {
  // Step 1: fetch live context (all sources in parallel inside buildPredictionContext)
  const ctx = await buildPredictionContext(market.question).catch(() => null);
  const contextBlock = ctx
    ? formatContextBlock(ctx)
    : '━━━ LIVE MARKET INTELLIGENCE ━━━\nNo context available.';

  // Step 2: run all 10 analysts in parallel with the context
  const analystResults = await Promise.allSettled(
    ANALYST_ROLES.map((a) => runAnalyst(market, a.role, a.lens, contextBlock)),
  );

  const opinions: AnalystOpinion[] = analystResults
    .filter(
      (r): r is PromiseFulfilledResult<AnalystOpinion> =>
        r.status === 'fulfilled' && r.value !== null,
    )
    .map((r) => r.value);

  if (opinions.length === 0) {
    throw new Error(`All analysts failed for market ${market.id}`);
  }

  // Step 3: Aggregate — inject MiroFish swarm report if available (claude-opus-4.7)
  const agg = await aggregateOpinions(market, opinions, contextBlock, miroFishReport);

  const edge = Math.abs(agg.consensusProb - market.yesPrice);
  const recommendedSide =
    edge < 0.10 || agg.confidence < 0.60
      ? 'SKIP'
      : agg.consensusProb > market.yesPrice
      ? 'YES'
      : 'NO';

  return {
    marketId: market.id,
    question: market.question,
    marketProb: market.yesPrice,
    yourProb: agg.consensusProb,
    edge,
    recommendedSide,
    confidence: agg.confidence,
    keyEvidence: agg.keyEvidence,
    reasoning: agg.reasoning,
    volumeUsd: market.volumeUsd,
    endDate: market.endDate,
    daysLeft: market.daysLeft,
    analystCount: opinions.length,
    miroFishEnhanced: miroFishReport !== null,
    source: market.source,
    analystBreakdown: opinions.map((o) => ({
      role: o.role,
      yourProb: o.yourProb,
      confidence: o.confidence,
      headline: o.headline,
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
  // Local dev: 4 Polymarket + 1 Kalshi = 5 total (~45 sec scan)
  // On VPS bump these back up to 30 + 15 = 45 for full coverage
  const [polyMarkets, kalshiMarkets] = await Promise.all([
    fetchActiveMarkets({ minVolume: 50_000, maxDaysLeft: 90, limit: 4 }),
    fetchKalshiMarkets({ minVolume: 5_000,  maxDaysLeft: 90, limit: 1 }),
  ]);

  // Merge, cap at 5
  const markets = [...polyMarkets, ...kalshiMarkets].slice(0, 5);

  // Top 1 gets MiroFish (skip during local dev — Docker not running)
  const [top1, ...rest] = markets;

  const miroFishReport = top1
    ? await runMiroFishAnalysis(top1, `Question: ${top1.question}`).catch(() => null)
    : null;

  const predictions: Prediction[] = [];

  // Top 1 with MiroFish
  if (top1) {
    const r = await analyseMarket(top1, miroFishReport).catch(() => null);
    if (r) predictions.push(r);
  }

  // Remaining in batches of 5 (faster than batches of 2)
  for (let i = 0; i < rest.length; i += 5) {
    const batch = rest.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map((m) => analyseMarket(m, null)));
    for (const r of results) {
      if (r.status === 'fulfilled') predictions.push(r.value);
    }
  }

  const withEdge = predictions.filter((p) => p.recommendedSide !== 'SKIP').length;
  return { predictions, scanned: markets.length, withEdge };
}

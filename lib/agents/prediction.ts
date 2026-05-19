import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS, MODELS } from '@/lib/llm/models';
import { fetchActiveMarkets, type ParsedMarket } from '@/lib/sources/polymarket';

// ─── Final output schema (what gets stored in DB) ────────────────────────────

export const PredictionSchema = z.object({
  marketId: z.string(),
  question: z.string(),
  marketProb: z.number().min(0).max(1),
  yourProb: z.number().min(0).max(1),       // ensemble consensus
  edge: z.number().min(0).max(1),
  recommendedSide: z.enum(['YES', 'NO', 'SKIP']),
  confidence: z.number().min(0).max(1),     // avg analyst confidence
  keyEvidence: z.array(z.string()).max(5),
  reasoning: z.string().max(800),           // synthesis from aggregator
  volumeUsd: z.number(),
  endDate: z.string(),
  daysLeft: z.number(),
  // ensemble metadata
  analystCount: z.number(),
  analystBreakdown: z.array(z.object({
    role: z.string(),
    yourProb: z.number(),
    confidence: z.number(),
    headline: z.string(),
  })).optional(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

// ─── Individual analyst output schema ────────────────────────────────────────

const AnalystSchema = z.object({
  yourProb: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  headline: z.string().max(120),    // one-sentence thesis
  evidence: z.array(z.string()).max(3),
});

type AnalystOpinion = z.infer<typeof AnalystSchema> & { role: string };

// ─── Aggregator output schema ─────────────────────────────────────────────────

const AggregatorSchema = z.object({
  consensusProb: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  keyEvidence: z.array(z.string()).max(5),
  reasoning: z.string().max(800),
});

// ─── The 8 analyst roles (MiroFish ensemble) ─────────────────────────────────

const ANALYST_ROLES = [
  {
    role: 'Macro Analyst',
    lens: 'Focus on macro-economic trends, policy cycles, and structural forces that could move this outcome. Calibrate against historical crowd accuracy on macro-driven events.',
  },
  {
    role: 'Base Rate Analyst',
    lens: 'Ignore all narrative. Focus purely on historical base rates: How often do events of this type resolve YES? What is the reference class? Anchor your estimate there before adjusting.',
  },
  {
    role: 'Contrarian Analyst',
    lens: 'Steel-man the case AGAINST the crowd consensus. What is the market missing? What tail risk or overlooked factor shifts the probability significantly?',
  },
  {
    role: 'News Catalyst Analyst',
    lens: 'Identify specific known catalysts, upcoming events, scheduled announcements, or structural triggers that could shift the resolution before the deadline.',
  },
  {
    role: 'Market Microstructure Analyst',
    lens: 'Analyze the market mechanics: volume trends, liquidity depth, recent price movement. Is this market efficiently priced or are there signs of informed trading or thin liquidity distortion?',
  },
  {
    role: 'Sentiment Analyst',
    lens: 'Model crowd psychology and social consensus. Is the market experiencing herding, overconfidence, or narrative bias? Where is retail vs sophisticated money likely positioned?',
  },
  {
    role: 'Political/Regulatory Analyst',
    lens: 'Assess political dynamics, regulatory environment, and institutional behavior patterns. Focus on power structures, incentives of key decision-makers, and precedents.',
  },
  {
    role: 'Risk Analyst',
    lens: 'Focus on downside risk and tail scenarios. What black-swan or low-probability high-impact events could force an unexpected resolution? Assign probability mass to these tails.',
  },
] as const;

// ─── Run one analyst ──────────────────────────────────────────────────────────

async function runAnalyst(
  market: ParsedMarket,
  role: string,
  lens: string,
): Promise<AnalystOpinion | null> {
  try {
    const prompt = `You are a ${role} in a prediction market analyst ensemble.

MARKET:
- Question: ${market.question}
- Description: ${market.description?.slice(0, 600) || 'No description.'}
- Current Market Implied Probability (YES): ${(market.yesPrice * 100).toFixed(1)}%
- Volume: $${market.volumeUsd.toLocaleString()} | Liquidity: $${market.liquidityUsd.toLocaleString()}
- Resolves: ${market.endDate} (${market.daysLeft} days left)

YOUR ANALYTICAL LENS: ${lens}

Apply ONLY your specialist lens above. Give your probability estimate for YES resolution and your confidence in it.
- yourProb: your estimate (not just anchoring on market price)
- confidence: how certain you are (0.0 = random guess, 1.0 = near certain)
- headline: one sentence summarizing your thesis
- evidence: 1-3 bullet points from your lens`;

    const { object } = await generateObject({
      model: dgrid(MODELS.classifier), // DeepSeek — fast + cheap for ensemble
      schema: AnalystSchema,
      prompt,
    });

    return { ...object, role };
  } catch {
    return null;
  }
}

// ─── Aggregate analyst opinions into final verdict ────────────────────────────

async function aggregateOpinions(
  market: ParsedMarket,
  opinions: AnalystOpinion[],
): Promise<z.infer<typeof AggregatorSchema>> {
  const opinionText = opinions
    .map((o) => `${o.role}: prob=${(o.yourProb * 100).toFixed(0)}%, conf=${(o.confidence * 100).toFixed(0)}%\n  "${o.headline}"`)
    .join('\n');

  const prompt = `You are the Chief Analyst aggregating a ${opinions.length}-member analyst ensemble for a prediction market.

MARKET: ${market.question}
Market Implied Probability (YES): ${(market.yesPrice * 100).toFixed(1)}%
Volume: $${market.volumeUsd.toLocaleString()} | Resolves: ${market.endDate}

ANALYST PANEL OPINIONS:
${opinionText}

TASK:
1. Compute a confidence-weighted consensus probability (weight each analyst by their confidence score)
2. Identify where analysts agree vs. where they sharply diverge — divergence reduces consensus confidence
3. Synthesize the 3-5 most important evidence points across all analysts
4. Write a 2-4 sentence investment thesis

Be honest about disagreement. If analysts are highly split, lower the confidence accordingly.`;

  const { object } = await generateObject({
    model: dgrid(AGENT_MODELS.prediction), // Claude Opus — synthesis only
    schema: AggregatorSchema,
    prompt,
  });

  return object;
}

// ─── Run full ensemble for one market ────────────────────────────────────────

export async function analyseMarket(market: ParsedMarket): Promise<Prediction> {
  // Run all 8 analysts in parallel
  const rawOpinions = await Promise.allSettled(
    ANALYST_ROLES.map((a) => runAnalyst(market, a.role, a.lens))
  );

  const opinions: AnalystOpinion[] = rawOpinions
    .filter((r): r is PromiseFulfilledResult<AnalystOpinion> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value);

  if (opinions.length === 0) {
    throw new Error(`All analysts failed for market ${market.id}`);
  }

  // Aggregate with Chief Analyst
  const agg = await aggregateOpinions(market, opinions);

  // Enforce edge / skip logic
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
    analystBreakdown: opinions.map((o) => ({
      role: o.role,
      yourProb: o.yourProb,
      confidence: o.confidence,
      headline: o.headline,
    })),
  };
}

// ─── Run full prediction scan ─────────────────────────────────────────────────

export async function runPredictionScan(): Promise<{
  predictions: Prediction[];
  scanned: number;
  withEdge: number;
}> {
  const markets = await fetchActiveMarkets({ minVolume: 50_000, maxDaysLeft: 30 });

  // Analyse in batches of 2 (each market now fires 8+1 LLM calls)
  const predictions: Prediction[] = [];
  for (let i = 0; i < markets.length; i += 2) {
    const batch = markets.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map(analyseMarket));
    for (const r of results) {
      if (r.status === 'fulfilled') predictions.push(r.value);
    }
  }

  const withEdge = predictions.filter((p) => p.recommendedSide !== 'SKIP').length;
  return { predictions, scanned: markets.length, withEdge };
}

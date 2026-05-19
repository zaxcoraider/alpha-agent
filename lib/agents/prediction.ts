import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';
import { fetchActiveMarkets, type ParsedMarket } from '@/lib/sources/polymarket';

// ─── Output schema (MiroFish-style structured report per market) ──────────────

export const PredictionSchema = z.object({
  marketId: z.string(),
  question: z.string(),
  marketProb: z.number().min(0).max(1),   // implied YES probability
  yourProb: z.number().min(0).max(1),     // analyst estimate
  edge: z.number().min(0).max(1),         // abs(yourProb - marketProb)
  recommendedSide: z.enum(['YES', 'NO', 'SKIP']),
  confidence: z.number().min(0).max(1),   // analyst confidence in estimate
  keyEvidence: z.array(z.string()).max(5), // 3-5 bullet points of reasoning
  reasoning: z.string().max(600),          // full chain-of-thought
  volumeUsd: z.number(),
  endDate: z.string(),
  daysLeft: z.number(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

// ─── MiroFish-inspired ReACT analyst prompt ───────────────────────────────────

function buildAnalystPrompt(market: ParsedMarket): string {
  return `You are a prediction market analyst operating in a MiroFish-style pipeline.

SEED MATERIAL:
- Question: ${market.question}
- Market Description: ${market.description?.slice(0, 800) || 'No description provided.'}
- Current Market Implied Probability (YES): ${(market.yesPrice * 100).toFixed(1)}%
- 24h Volume: $${market.volumeUsd.toLocaleString()}
- Liquidity: $${market.liquidityUsd.toLocaleString()}
- Resolves: ${market.endDate} (${market.daysLeft} days left)

REASONING STEPS (follow all four before concluding):
1. CALIBRATION: What does the current implied probability tell you? Is the crowd historically over- or under-confident on this type of event?
2. BASE RATE: What is the historical base rate for similar events resolving YES?
3. CATALYSTS: What known catalysts, news, or structural factors could push the outcome either way before resolution?
4. EDGE DETECTION: Where does your estimate meaningfully diverge from the market? Only flag an edge if |yourProb - marketProb| > 0.10 AND confidence > 0.60.

OUTPUT RULES:
- If edge < 0.10 OR confidence < 0.60 → recommendedSide = "SKIP"
- keyEvidence: exactly 3-5 concise bullets citing your reasoning steps
- reasoning: 2-4 sentence summary of your thesis
- Be honest about uncertainty — do not force an edge where none exists`;
}

// ─── Analyse a single market ─────────────────────────────────────────────────

export async function analyseMarket(market: ParsedMarket): Promise<Prediction> {
  const { object } = await generateObject({
    model: dgrid(AGENT_MODELS.prediction),
    schema: PredictionSchema,
    prompt: buildAnalystPrompt(market),
  });

  // Enforce edge / skip logic post-generation
  const edge = Math.abs(object.yourProb - market.yesPrice);
  const recommendedSide =
    edge < 0.10 || object.confidence < 0.60
      ? 'SKIP'
      : object.yourProb > market.yesPrice
      ? 'YES'
      : 'NO';

  return {
    ...object,
    marketId: market.id,
    question: market.question,
    marketProb: market.yesPrice,
    edge,
    recommendedSide,
    volumeUsd: market.volumeUsd,
    endDate: market.endDate,
    daysLeft: market.daysLeft,
  };
}

// ─── Run full prediction scan ─────────────────────────────────────────────────

export async function runPredictionScan(): Promise<{
  predictions: Prediction[];
  scanned: number;
  withEdge: number;
}> {
  const markets = await fetchActiveMarkets({ minVolume: 50_000, maxDaysLeft: 30 });

  // Analyse in batches of 3 to avoid rate limits
  const predictions: Prediction[] = [];
  for (let i = 0; i < markets.length; i += 3) {
    const batch = markets.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(analyseMarket));
    for (const r of results) {
      if (r.status === 'fulfilled') predictions.push(r.value);
    }
  }

  const withEdge = predictions.filter((p) => p.recommendedSide !== 'SKIP').length;
  return { predictions, scanned: markets.length, withEdge };
}

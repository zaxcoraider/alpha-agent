// VPS predict server — handles custom predictions from the Vercel UI
// Runs on port 5002, accepts POST /predict, responds immediately, runs in background
// Start with: bash scripts/run-predict-server.sh

import http from 'http';
import { analyseMarket } from '@/lib/agents/prediction';
import { runMiroFishAnalysis, type SwarmDepth } from '@/lib/sources/mirofish';
import { buildPredictionContext, formatContextBlock } from '@/lib/sources/prediction-context';
import { db } from '@/lib/db/client';
import { scanResults } from '@/lib/db/schema';
import type { ParsedMarket } from '@/lib/sources/polymarket';

const PORT         = 5002;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? '';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/predict') {
    res.writeHead(404); res.end('Not found'); return;
  }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ACCESS_TOKEN}`) {
    res.writeHead(401); res.end('Unauthorized'); return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const { question, jobId, market: rawMarket, depth = 'standard' } =
        JSON.parse(body) as { question: string; jobId: string; market: ParsedMarket | null; depth?: SwarmDepth };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, jobId }));

      runCustomPredict(question, jobId, rawMarket, depth).catch(console.error);
    } catch {
      res.writeHead(400); res.end('Bad request');
    }
  });
});

async function runCustomPredict(
  question: string,
  jobId: string,
  rawMarket: ParsedMarket | null,
  depth: SwarmDepth,
) {
  console.log(`[predict-server] Starting custom-${jobId} depth=${depth} q="${question.slice(0, 60)}"`);

  const market: ParsedMarket = rawMarket ?? {
    id:          `custom-${jobId}`,
    question,
    description: '',
    yesPrice:    0.5,
    noPrice:     0.5,
    volumeUsd:   0,
    liquidityUsd: 0,
    endDate:     new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    daysLeft:    30,
    source:      'polymarket',
  };

  try {
    const ctx          = await buildPredictionContext(question).catch(() => null);
    const contextBlock = ctx ? formatContextBlock(ctx) : '━━━ LIVE MARKET INTELLIGENCE ━━━\nNo context available.';

    const miroFish   = await runMiroFishAnalysis(market, contextBlock, depth).catch(() => null);
    const prediction = await analyseMarket(market, miroFish, contextBlock);

    await db.insert(scanResults).values({
      agent:      'prediction',
      externalId: `custom-${jobId}`,
      title:      prediction.question,
      summary:    prediction.reasoning,
      score:      String(Math.round(prediction.edge * 100) / 10),
      raw:        prediction,
    }).onConflictDoUpdate({
      target: [scanResults.agent, scanResults.externalId],
      set: { raw: prediction, summary: prediction.reasoning, score: String(Math.round(prediction.edge * 100) / 10) },
    });

    console.log(`[predict-server] custom-${jobId} done — side=${prediction.recommendedSide} edge=${(prediction.edge * 100).toFixed(0)}%`);
  } catch (err) {
    console.error(`[predict-server] custom-${jobId} failed:`, err);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[predict-server] Listening on port ${PORT}`);
});

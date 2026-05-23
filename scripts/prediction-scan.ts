// VPS prediction scan runner — called by run-scan.sh via PM2 cron
// Env vars are loaded by the shell wrapper (source .env.local)
// No Vercel timeout — runs the full 30-45 min pipeline on VPS

import { runPredictionScan } from '@/lib/agents/prediction';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { sendScanAlert } from '@/lib/telegram';
import { eq } from 'drizzle-orm';

async function main() {
  const start = Date.now();
  console.log(`[prediction-scan] Starting at ${new Date().toISOString()}`);

  const [run] = await db.insert(scanRuns).values({
    agent: 'prediction',
    trigger: 'cron',
    status: 'running',
    modelUsed: 'deepseek-v3.1-terminus-exacto + claude-opus-4.7 + MiroFish',
  }).returning();

  try {
    const { predictions, scanned, withEdge } = await runPredictionScan();

    for (const p of predictions) {
      await db.insert(scanResults).values({
        runId: run.id,
        agent: 'prediction',
        externalId: p.marketId,
        title: p.question,
        summary: p.reasoning,
        score: String(Math.round(p.edge * 100) / 10),
        raw: p,
      }).onConflictDoUpdate({
        target: [scanResults.agent, scanResults.externalId],
        set: {
          raw: p,
          summary: p.reasoning,
          score: String(Math.round(p.edge * 100) / 10),
          runId: run.id,
        },
      });
    }

    await db.update(scanRuns)
      .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
      .where(eq(scanRuns.id, run.id));

    await sendScanAlert(predictions, scanned);

    const mins = ((Date.now() - start) / 60_000).toFixed(1);
    console.log(`[prediction-scan] Done in ${mins}min — scanned=${scanned} withEdge=${withEdge} saved=${predictions.length}`);
    process.exit(0);

  } catch (err) {
    await db.update(scanRuns)
      .set({ status: 'error', finishedAt: new Date(), error: String(err) })
      .where(eq(scanRuns.id, run.id)).catch(() => null);
    console.error('[prediction-scan] Fatal:', err);
    process.exit(1);
  }
}

main();

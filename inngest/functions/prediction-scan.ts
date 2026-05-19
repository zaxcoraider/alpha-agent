import { inngest } from '../client';
import { runPredictionScan } from '@/lib/agents/prediction';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';

export const predictionScan = inngest.createFunction(
  { id: 'prediction-scan', name: 'Prediction Market Scan' },
  [
    { cron: '0 8 * * *' },          // daily 08:00
    { event: 'agent/prediction.run' }, // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent: 'prediction',
        trigger: 'cron',
        status: 'running',
        modelUsed: 'anthropic/claude-opus-4',
      }).returning();
      return r;
    });

    const { predictions, scanned, withEdge } = await step.run('analyse-markets', async () => {
      return runPredictionScan();
    });

    await step.run('save-results', async () => {
      for (const p of predictions) {
        await db.insert(scanResults).values({
          runId: run.id,
          agent: 'prediction',
          externalId: `polymarket-${p.marketId}`,
          title: p.question,
          summary: p.reasoning,
          score: String(Math.round(p.edge * 100) / 10), // edge as score 0-10
          raw: p,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { raw: p, summary: p.reasoning, score: String(Math.round(p.edge * 100) / 10) },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where((t) => t.id === run.id);
    });

    return { scanned, withEdge, saved: predictions.length };
  }
);

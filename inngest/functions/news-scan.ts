import { inngest } from '../client';
import { runNewsScan } from '@/lib/agents/news';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { AGENT_MODELS } from '@/lib/llm/models';
import { eq } from 'drizzle-orm';

export const newsScan = inngest.createFunction(
  { id: 'news-scan', name: 'News Scanner' },
  [
    { cron: '0 */4 * * *' },       // every 4 hours (budget tune; was 0/30m)
    { event: 'agent/news.run' },    // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent: 'news',
        trigger: 'cron',
        status: 'running',
        modelUsed: AGENT_MODELS.news,
      }).returning();
      return r;
    });

    const { items, scanned } = await step.run('fetch-and-classify', async () => {
      return runNewsScan();
    });

    await step.run('save-results', async () => {
      for (const item of items) {
        await db.insert(scanResults).values({
          runId: run.id,
          agent: 'news',
          externalId: `news-${Buffer.from(item.url).toString('base64').slice(0, 40)}`,
          title: item.title,
          summary: item.whyRelevant,
          url: item.url,
          score: String(item.score),
          chains: item.chains as ('sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown')[],
          raw: item,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: {
            summary: item.whyRelevant,
            score: String(item.score),
            raw: item,
          },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));
    });

    return { scanned, saved: items.length };
  }
);

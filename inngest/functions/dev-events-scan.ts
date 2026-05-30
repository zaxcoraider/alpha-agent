import { inngest } from '../client';
import { runDevEventsScan } from '@/lib/agents/dev-events';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { MODELS } from '@/lib/llm/models';
import { eq } from 'drizzle-orm';

type DbChain = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  ethereum: 'eth',   solana: 'sol',     evm: 'eth',       bnb: 'bsc',
  binance:  'bsc',   bsc:    'bsc',     polygon: 'polygon', arbitrum: 'arbitrum',
  base:     'base',  optimism: 'optimism', sui: 'sui',    sol: 'sol',
  eth:      'eth',
};

function toDbChains(chains: string[]): DbChain[] {
  const mapped = chains.map((c) => CHAIN_MAP[c.toLowerCase()] ?? 'unknown');
  return [...new Set(mapped)];
}

export const devEventsScan = inngest.createFunction(
  { id: 'dev-events-scan', name: 'Dev Events Scanner' },
  [
    { cron: '0 */8 * * *' },             // every 8 hours (budget tune; was 2h)
    { event: 'agent/dev-events.run' },   // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent:      'dev_events',
        trigger:    'cron',
        status:     'running',
        modelUsed:  MODELS.grok,
      }).returning();
      return r;
    });

    const { opportunities, scanned } = await step.run('discover-and-process', async () => {
      return runDevEventsScan();
    });

    await step.run('save-results', async () => {
      for (const opp of opportunities) {
        const raw = (opp.sourceUrl ?? opp.title).slice(0, 60);
        const externalId = `dev-${Buffer.from(raw).toString('base64').slice(0, 40)}`;

        await db.insert(scanResults).values({
          runId:      run.id,
          agent:      'dev_events',
          externalId,
          title:      opp.title,
          summary:    opp.matchReason,
          url:        opp.sourceUrl,
          score:      String(opp.matchScore),
          chains:     toDbChains(opp.chains),
          raw:        opp,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: {
            summary: opp.matchReason,
            score:   String(opp.matchScore),
            raw:     opp,
          },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));
    });

    return { scanned, saved: opportunities.length };
  },
);

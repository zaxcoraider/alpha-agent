import { inngest } from '../client';
import { runXEventsScan } from '@/lib/agents/x-events';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { MODELS } from '@/lib/llm/models';
import { eq } from 'drizzle-orm';
import { sendTelegram } from '@/lib/telegram';
import { env } from '@/lib/env';

type DbChain = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  sol: 'sol', eth: 'eth', base: 'base', arbitrum: 'arbitrum',
  polygon: 'polygon', bnb: 'bsc', any: 'unknown',
};

const TYPE_EMOJI: Record<string, string> = {
  space:        '🎙',
  viral_thread: '🔥',
  kol_alert:    '👁',
  airdrop:      '🪂',
  token_unlock: '🔓',
  listing:      '📈',
};

export const xEventsScan = inngest.createFunction(
  { id: 'x-events-scan', name: 'X Events Scanner' },
  [
    { cron: '0 * * * *' },            // every hour
    { event: 'agent/x-events.run' },  // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent:     'x_events',
        trigger:   'cron',
        status:    'running',
        modelUsed: MODELS.balanced,
      }).returning();
      return r;
    });

    const { events, scanned } = await step.run('scan-and-score', async () => {
      return runXEventsScan();
    });

    await step.run('save-and-alert', async () => {
      const urgent = events.filter(
        (e) => (e.urgency === 'live' || e.urgency === 'today') && e.relevanceScore >= 8,
      );

      for (const event of events) {
        const rawId      = event.title.slice(0, 60);
        const externalId = `xev-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;
        const chain      = event.chain ? [CHAIN_MAP[event.chain] ?? 'unknown'] : [];

        await db.insert(scanResults).values({
          runId:      run.id,
          agent:      'x_events',
          externalId,
          title:      event.title,
          summary:    event.description,
          url:        event.url,
          score:      String(event.relevanceScore),
          chains:     chain as DbChain[],
          raw:        event,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: {
            summary: event.description,
            score:   String(event.relevanceScore),
            raw:     event,
          },
        });
      }

      const chatId = env.TELEGRAM_CHAT_ID;

      if (chatId) {
        for (const e of urgent.slice(0, 3)) {
          const emoji = TYPE_EMOJI[e.type] ?? '📌';
          await sendTelegram(
            chatId,
            `${emoji} <b>${e.title}</b>\n` +
            `${e.description}\n` +
            (e.actionSummary ? `\n→ ${e.actionSummary}` : '') +
            (e.url ? `\n<a href="${e.url}">Open →</a>` : ''),
          ).catch(() => { /* non-fatal */ });
        }
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));
    });

    return { scanned, saved: events.length };
  },
);

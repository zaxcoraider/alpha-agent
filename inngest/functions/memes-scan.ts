import { inngest } from '../client';
import { runMemesScan } from '@/lib/agents/memes';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { MODELS } from '@/lib/llm/models';
import { eq } from 'drizzle-orm';
import { sendTelegram } from '@/lib/telegram';
import { env } from '@/lib/env';

type DbChain = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  sol: 'sol', eth: 'eth', base: 'base', bnb: 'bsc',
};

export const memesScan = inngest.createFunction(
  { id: 'memes-scan', name: 'Meme Radar Scanner' },
  [
    { cron: '0 */2 * * *' },         // every 2 hours (budget tune; was */30m)
    { event: 'agent/memes.run' },    // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent:     'memes',
        trigger:   'cron',
        status:    'running',
        modelUsed: MODELS.reasoner,
      }).returning();
      return r;
    });

    const { tokens, scanned } = await step.run('scan-and-analyze', async () => {
      return runMemesScan();
    });

    await step.run('save-and-alert', async () => {
      const hotGems = tokens.filter((t) => t.gemScore >= 75);

      for (const token of tokens) {
        const rawId    = (token.contractAddress ?? `${token.ticker}-${token.chain}`).slice(0, 60);
        const externalId = `meme-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;

        await db.insert(scanResults).values({
          runId:      run.id,
          agent:      'memes',
          externalId,
          title:      `${token.name} ($${token.ticker})`,
          summary:    token.gemBreakdown,
          url:        token.dexUrl,
          score:      String(token.gemScore / 10),
          chains:     [CHAIN_MAP[token.chain] ?? 'unknown'],
          raw:        token,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: {
            summary: token.gemBreakdown,
            score:   String(token.gemScore / 10),
            raw:     token,
          },
        });
      }

      const chatId = env.TELEGRAM_CHAT_ID;

      if (chatId) {
        for (const t of hotGems) {
          const changeStr = t.priceChange1h !== undefined
            ? ` · ${t.priceChange1h > 0 ? '+' : ''}${t.priceChange1h.toFixed(1)}% 1h`
            : '';
          const mcapStr = t.marketCapUsd
            ? ` · $${(t.marketCapUsd / 1_000).toFixed(0)}K mcap`
            : '';

          await sendTelegram(
            chatId,
            `🚀 <b>Meme Gem Alert — ${t.gemScore}/100</b>\n` +
            `<b>$${t.ticker}</b> (${t.chain.toUpperCase()}) ${changeStr}${mcapStr}\n` +
            `Narrative: ${t.narrative}\n` +
            `Rug: ${t.rugRisk.toUpperCase()} · Action: ${t.watchAction.replace('_', ' ')}\n` +
            `${t.dexUrl ? `<a href="${t.dexUrl}">View on DexScreener</a>` : 'No DEX link yet'}`,
          ).catch(() => { /* non-fatal */ });
        }
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));
    });

    return { scanned, saved: tokens.length };
  },
);

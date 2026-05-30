import { inngest } from '../client';
import { runNFTMintsScan } from '@/lib/agents/nft-mints';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { MODELS } from '@/lib/llm/models';
import { eq } from 'drizzle-orm';
import { sendTelegram } from '@/lib/telegram';
import { env } from '@/lib/env';

type DbChain = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  sol: 'sol', eth: 'eth', base: 'base', arbitrum: 'arbitrum',
  polygon: 'polygon', bnb: 'bsc',
};

export const nftMintsScan = inngest.createFunction(
  { id: 'nft-mints-scan', name: 'NFT Mints Scanner' },
  [
    { cron: '0 */4 * * *' },          // every 4 hours (budget tune; was */15m)
    { event: 'agent/nft-mints.run' }, // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent:     'nft',
        trigger:   'cron',
        status:    'running',
        modelUsed: MODELS.grok,
      }).returning();
      return r;
    });

    const { mints, scanned } = await step.run('scan-and-analyze', async () => {
      return runNFTMintsScan();
    });

    await step.run('save-and-alert', async () => {
      const highAlpha = mints.filter((m) => m.alphaScore >= 80);
      const freeFound = mints.filter((m) => m.mintPrice === 0);

      for (const mint of mints) {
        const rawId = (mint.contractAddress ?? mint.name).slice(0, 60);
        const externalId = `nft-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;

        await db.insert(scanResults).values({
          runId:      run.id,
          agent:      'nft',
          externalId,
          title:      mint.name,
          summary:    mint.alphaBreakdown,
          url:        mint.mintLink,
          score:      String(mint.alphaScore / 10), // normalise 0-100 → 0-10
          chains:     [CHAIN_MAP[mint.chain] ?? 'unknown'],
          raw:        mint,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: {
            summary: mint.alphaBreakdown,
            score:   String(mint.alphaScore / 10),
            raw:     mint,
          },
        });
      }

      const chatId = env.TELEGRAM_CHAT_ID;

      // Telegram alerts — high alpha
      if (chatId) {
        for (const m of highAlpha) {
          await sendTelegram(
            chatId,
            `🎨 <b>NFT Alpha Alert — ${m.alphaScore}/100</b>\n` +
            `<b>${m.name}</b> (${m.chain.toUpperCase()})\n` +
            `Price: ${m.mintPrice === 0 ? 'FREE' : `${m.mintPrice} ${m.mintPriceCurrency}`} · ` +
            `Status: ${m.mintStatus.replace('_', ' ')}\n` +
            `Rug risk: ${m.rugRisk.toUpperCase()}\n` +
            (m.mintLink ? `<a href="${m.mintLink}">Mint Now</a>` : 'No link yet'),
          ).catch(() => { /* non-fatal */ });
        }

        // Free mint alerts (if not already caught by high alpha)
        for (const m of freeFound.filter((f) => f.alphaScore < 80)) {
          await sendTelegram(
            chatId,
            `🆓 <b>Free Mint Detected</b>\n` +
            `<b>${m.name}</b> (${m.chain.toUpperCase()}) · Alpha: ${m.alphaScore}/100\n` +
            `Rug: ${m.rugRisk} · CT: ${m.ctMentions} mentions\n` +
            (m.mintLink ? `<a href="${m.mintLink}">Mint Now</a>` : 'No link yet'),
          ).catch(() => { /* non-fatal */ });
        }
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));
    });

    return { scanned, saved: mints.length };
  },
);

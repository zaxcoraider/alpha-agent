import { inngest } from '../client';
import { analyseMarket } from '@/lib/agents/prediction';
import { sendTelegram, formatPredictionCard } from '@/lib/telegram';
import { db } from '@/lib/db/client';
import { scanResults } from '@/lib/db/schema';
import type { ParsedMarket } from '@/lib/sources/polymarket';

export const customPredict = inngest.createFunction(
  { id: 'custom-predict', name: 'Custom Prediction' },
  { event: 'agent/custom-predict' },
  async ({ event, step }) => {
    const {
      question,
      chatId,
      jobId,
      market: passedMarket,
    } = event.data as {
      question: string;
      chatId?: string | null;
      jobId?: string | null;
      market?: ParsedMarket | null;
    };

    const prediction = await step.run('analyse', async () => {
      const market: ParsedMarket = passedMarket ?? {
        id: `custom-${Date.now()}`,
        question,
        description: '',
        yesPrice: 0.5,
        noPrice: 0.5,
        volumeUsd: 0,
        liquidityUsd: 0,
        endDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
        daysLeft: 90,
      };
      return analyseMarket(market, null);
    });

    // Save to DB so the dashboard can poll for it
    if (jobId) {
      await step.run('save-to-db', async () => {
        await db.insert(scanResults).values({
          agent: 'prediction',
          externalId: `custom-${jobId}`,
          title: prediction.question,
          summary: prediction.reasoning,
          score: String(Math.round(prediction.edge * 100) / 10),
          raw: prediction,
        }).onConflictDoNothing();
      });
    }

    // Send Telegram notification if triggered from the bot
    if (chatId) {
      await step.run('notify-telegram', async () => {
        const card = formatPredictionCard(prediction);
        const note = prediction.marketProb === 0.5
          ? '\n\n<i>No market price anchor — ensemble-only estimate.</i>'
          : '';
        const reasoning = prediction.reasoning
          ? `\n\n${prediction.reasoning.slice(0, 500)}`
          : '';
        await sendTelegram(chatId, `🔮 <b>Prediction Result</b>\n\n${card}${reasoning}${note}`);
      });
    }

    return { question, side: prediction.recommendedSide, edge: prediction.edge };
  },
);

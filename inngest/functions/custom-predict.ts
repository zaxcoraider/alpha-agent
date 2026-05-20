import { inngest } from '../client';
import { analyseMarket } from '@/lib/agents/prediction';
import { sendTelegram, formatPredictionCard } from '@/lib/telegram';
import type { ParsedMarket } from '@/lib/sources/polymarket';

export const customPredict = inngest.createFunction(
  { id: 'custom-predict', name: 'Custom Prediction' },
  { event: 'agent/custom-predict' },
  async ({ event, step }) => {
    const { question, chatId } = event.data as { question: string; chatId: string };

    const prediction = await step.run('analyse', async () => {
      // Synthetic market — no market price anchor, ensemble-only estimate
      const market: ParsedMarket = {
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

    await step.run('notify', async () => {
      const card = formatPredictionCard(prediction);
      const note = '\n\n<i>No market price anchor — ensemble-only estimate.</i>';
      const reasoning = prediction.reasoning
        ? `\n\n${prediction.reasoning.slice(0, 500)}`
        : '';
      await sendTelegram(chatId, `🔮 <b>Prediction Result</b>\n\n${card}${reasoning}${note}`);
    });

    return { question, side: prediction.recommendedSide, edge: prediction.edge };
  },
);

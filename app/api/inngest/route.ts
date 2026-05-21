import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { morningScan } from '@/inngest/functions/morning-scan';
import { predictionScan } from '@/inngest/functions/prediction-scan';
import { newsScan } from '@/inngest/functions/news-scan';
import { customPredict } from '@/inngest/functions/custom-predict';
import { telegramPoll } from '@/inngest/functions/telegram-poll';
import { devEventsScan } from '@/inngest/functions/dev-events-scan';
import { nftMintsScan } from '@/inngest/functions/nft-mints-scan';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [morningScan, predictionScan, newsScan, customPredict, telegramPoll, devEventsScan, nftMintsScan],
});

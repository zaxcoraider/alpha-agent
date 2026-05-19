import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { morningScan } from '@/inngest/functions/morning-scan';
import { predictionScan } from '@/inngest/functions/prediction-scan';
import { newsScan } from '@/inngest/functions/news-scan';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [morningScan, predictionScan, newsScan],
});

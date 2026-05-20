import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';

// Grok has native real-time access to X (Twitter) — no twitterapi.io key needed.
// We use generateObject so the social signal is structured and schema-validated.

const GrokSocialSchema = z.object({
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
  // -1.0 = strongly bearish (NO likely), +1.0 = strongly bullish (YES likely)
  sentimentScore: z.number().min(-1).max(1),
  topNarratives: z.array(z.string().max(150)).max(4),
  keyAccounts: z.array(z.string()).max(4),   // influential X handles driving the convo
  volumeTrend: z.enum(['rising', 'falling', 'stable']),
  summary: z.string().max(400),
});

export type GrokSocialSignal = z.infer<typeof GrokSocialSchema>;

export async function getGrokSocialSignal(
  question: string,
): Promise<GrokSocialSignal | null> {
  try {
    const { object } = await generateObject({
      model: dgrid(AGENT_MODELS.prediction_social), // grok-4.20-non-reasoning
      schema: GrokSocialSchema,
      prompt: `You have real-time access to X (Twitter). Search X right now for recent posts and discussions related to this prediction market question:

"${question}"

Analyze current social sentiment as it relates to the YES/NO resolution of this question.

Return:
- sentiment: the dominant lean on X — bullish (YES likely), bearish (NO likely), neutral, or mixed
- sentimentScore: -1.0 (strongly NO sentiment) to +1.0 (strongly YES sentiment)
- topNarratives: the 3-4 main talking points, arguments, or narratives circulating on X right now
- keyAccounts: notable X accounts (usernames without @) who are actively posting about this
- volumeTrend: is discussion volume rising, falling, or stable vs 7 days ago?
- summary: 2-3 sentences synthesizing what X is collectively saying and whether it agrees or disagrees with the current market probability

Be specific. Cite actual posts or narratives where possible. Do not hallucinate — if X is quiet on this topic, say so.`,
    });

    return object;
  } catch {
    return null;
  }
}

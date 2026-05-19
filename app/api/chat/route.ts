import { streamText } from 'ai';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, model } = await req.json();

  // Fall back to balanced model if none supplied or model is invalid
  const modelId = typeof model === 'string' && model.length > 0 ? model : MODELS.balanced;

  const result = streamText({
    model: dgrid(modelId),
    messages,
    system:
      'You are Alpha Agent — a personal crypto intelligence assistant. ' +
      'You have access to scan results from the dashboard. Be direct, concise, and signal-focused.',
  });

  return result.toDataStreamResponse();
}

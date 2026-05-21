import { streamText } from 'ai';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_SYSTEM =
  'You are Alpha Agent — a personal crypto intelligence assistant. ' +
  'You have real-time context from the dashboard scanners. Be direct, concise, and signal-focused.';

export async function POST(req: Request) {
  const { messages, model, systemPrompt, temperature } = await req.json() as {
    messages: unknown; model?: string; systemPrompt?: string; temperature?: number;
  };

  const modelId  = typeof model === 'string' && model.length > 0 ? model : MODELS.balanced;
  const system   = typeof systemPrompt === 'string' && systemPrompt.length > 0 ? systemPrompt : DEFAULT_SYSTEM;
  const temp     = typeof temperature === 'number' ? Math.max(0, Math.min(1, temperature)) : 0.7;

  const result = streamText({
    model:       dgrid(modelId),
    messages:    messages as Parameters<typeof streamText>[0]['messages'],
    system,
    temperature: temp,
    maxTokens:   4096,
  });

  return result.toDataStreamResponse();
}

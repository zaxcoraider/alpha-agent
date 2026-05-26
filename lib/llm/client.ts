import { createOpenAI } from '@ai-sdk/openai';

export const dgrid = createOpenAI({
  apiKey: process.env.DGRID_API_KEY!,
  baseURL: process.env.DGRID_BASE_URL!,
  compatibility: 'compatible',
});

// AI SDK v4 defaults temperature: 0 even when not specified (see: prepareCallSettings).
// For models like claude-opus-4.x that reject the temperature param entirely,
// we must strip it at the provider layer AFTER the SDK default is applied.
// Using Object.create keeps the full provider interface intact.
export function dgridNoTemp(modelId: string) {
  const inner = dgrid(modelId);
  const wrapper = Object.create(inner) as typeof inner;
  wrapper.doStream   = (opts: Parameters<typeof inner.doStream>[0])   =>
    inner.doStream({ ...opts, temperature: undefined });
  wrapper.doGenerate = (opts: Parameters<typeof inner.doGenerate>[0]) =>
    inner.doGenerate({ ...opts, temperature: undefined });
  return wrapper;
}

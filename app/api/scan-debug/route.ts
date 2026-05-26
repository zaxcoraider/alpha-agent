import { NextResponse } from 'next/server';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

export const runtime   = 'nodejs';
export const maxDuration = 60;

// Simple test schema
const TestSchema = z.object({
  ok:      z.boolean(),
  message: z.string(),
});

async function testModel(label: string, fn: () => Promise<string>): Promise<{ label: string; ok: boolean; result?: string; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { label, ok: true, result: result.slice(0, 200), ms: Date.now() - t0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label, ok: false, error: msg.slice(0, 300), ms: Date.now() - t0 };
  }
}

export async function GET() {
  const results = await Promise.all([
    // 1. Sonnet 4.6 generateText (no temp strip)
    testModel('sonnet-4.6 generateText (dgrid)', () =>
      generateText({ model: dgrid(MODELS.balanced), prompt: 'Say "ok"', maxTokens: 5 }).then((r) => r.text),
    ),

    // 2. Sonnet 4.6 generateText (temp stripped)
    testModel('sonnet-4.6 generateText (dgridNoTemp)', () =>
      generateText({ model: dgridNoTemp(MODELS.balanced), prompt: 'Say "ok"', maxTokens: 5 }).then((r) => r.text),
    ),

    // 3. DeepSeek generateObject
    testModel('deepseek-v3.2 generateObject (dgrid)', () =>
      generateObject({ model: dgrid(MODELS.classifier), schema: TestSchema, mode: 'json', prompt: 'Return {"ok":true,"message":"works"}' })
        .then((r) => JSON.stringify(r.object)),
    ),

    // 4. Grok generateText (no temp strip)
    testModel('grok generateText (dgrid)', () =>
      generateText({ model: dgrid(MODELS.grok), prompt: 'Say "ok"', maxTokens: 10, abortSignal: AbortSignal.timeout(20_000) }).then((r) => r.text),
    ),

    // 5. Grok generateText (temp stripped)
    testModel('grok generateText (dgridNoTemp)', () =>
      generateText({ model: dgridNoTemp(MODELS.grok), prompt: 'Say "ok"', maxTokens: 10, abortSignal: AbortSignal.timeout(20_000) }).then((r) => r.text),
    ),

    // 6. DexScreener API
    testModel('dexscreener top-boosts (free API)', async () => {
      const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as unknown[];
      return `${data.length} tokens`;
    }),
  ]);

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ allOk, results }, { status: allOk ? 200 : 207 });
}

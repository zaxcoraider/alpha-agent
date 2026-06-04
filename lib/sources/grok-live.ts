import { generateText } from 'ai';
import { dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

// Grok's live-X search is flaky: even on a successful (non-error) call it
// sometimes returns an empty or refusal-style response, which makes the
// downstream GLM parse extract 0 items and silently zeroes a tab. Retry a few
// times and only accept a report with real content. Errors are logged but
// non-fatal across attempts.
//
// Appended to every prompt so Grok never replies empty — prefer live data, but
// fall back to recent known events rather than returning nothing.
export const NEVER_EMPTY_SUFFIX =
  `\n\nIMPORTANT: Always respond with a detailed report containing concrete, specific items — real handles, tickers, project names, dates and numbers. Never reply with an empty response, a refusal, or "I cannot access real-time data." If live search returns little, include the most significant relevant crypto events from the last 24-48 hours that you are aware of.`;

export async function grokLiveReport(
  prompt: string,
  tag: string,
  { attempts = 3, minChars = 60 }: { attempts?: number; minChars?: number } = {},
): Promise<string> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { text } = await generateText({
        model:       dgridNoTemp(MODELS.grok),
        abortSignal: AbortSignal.timeout(40_000),
        prompt,
      });
      const len = text.trim().length;
      if (len >= minChars) {
        console.log(`[sources/${tag}] Grok report ${text.length} chars (attempt ${attempt}/${attempts})`);
        return text;
      }
      console.warn(`[sources/${tag}] Grok returned empty/short report: ${len} chars (attempt ${attempt}/${attempts})`);
    } catch (err) {
      console.error(`[sources/${tag}] Grok step-1 failed (attempt ${attempt}/${attempts}):`, err);
    }
  }
  return '';
}

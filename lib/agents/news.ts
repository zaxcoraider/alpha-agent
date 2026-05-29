import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';
import { fetchRssFeeds } from '@/lib/sources/rss';
import { fetchCryptoPanicNews } from '@/lib/sources/cryptopanic';
import type { RssFeedItem } from '@/lib/sources/rss';

// Llama free tier rate-limits aggressively; cap pre-filter input to keep one call under the limit.
const PREFILTER_MAX_INPUT = 60;
// Keep ~40% of raw items for paid classification (cost plan target: ~60% reduction).
const PREFILTER_KEEP = 24;

// ─── Classification schema ────────────────────────────────────────────────────

export const NewsClassificationSchema = z.object({
  chains: z.array(
    z.enum(['sol', 'eth', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'sui', 'unknown'])
  ).min(1),
  category: z.enum([
    'protocol', 'hack', 'funding', 'regulation', 'meme',
    'infra', 'tooling', 'defi', 'nft', 'other',
  ]),
  score: z.number().min(0).max(10),
  whyRelevant: z.string().max(200),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
});

export type NewsClassification = z.infer<typeof NewsClassificationSchema>;

// ─── Full NewsItem = raw feed item + classification ───────────────────────────

export interface NewsItem extends RssFeedItem {
  chains: string[];
  category: string;
  score: number;
  whyRelevant: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

// ─── Classify a single item ───────────────────────────────────────────────────

export async function classifyNewsItem(raw: RssFeedItem): Promise<NewsItem> {
  const { object } = await generateObject({
    model: dgrid(AGENT_MODELS.news),
    schema: NewsClassificationSchema,
    prompt: `You are a crypto news classifier for a multi-chain developer who builds on Solana, Ethereum, Arbitrum, Base, Polygon, and Optimism.

Classify this news item:
Title: ${raw.title}
Source: ${raw.source}
Snippet: ${raw.snippet || '(no snippet)'}

Rules:
- chains: list EVERY chain affected, or ["unknown"] if chain-agnostic (e.g. regulation, funding)
- category: pick the single best fit
- score (0-10): relevance to a developer/investor in crypto — 8+ means "must read today"
- whyRelevant: 1-2 sentences on WHY a crypto dev should care (not just a restatement of the title)
- sentiment: bullish (positive for prices/adoption), bearish (negative), or neutral`,
  });

  return { ...raw, ...object };
}

// ─── Free pre-filter: Llama 3.3 70B picks the top-N signal items ──────────────
// One free LLM call ranks the batch before any paid classifier runs.
// Fails open: if rate-limited or errored, we fall back to processing all items.

const PreFilterSchema = z.object({
  keepIndexes: z.array(z.number().int().min(1)).max(PREFILTER_KEEP * 2),
});

async function preFilterNews(items: RssFeedItem[]): Promise<RssFeedItem[]> {
  if (items.length <= PREFILTER_KEEP) return items;

  // Truncate input to keep the free-tier call cheap and within context.
  const input = items.slice(0, PREFILTER_MAX_INPUT);
  const numbered = input
    .map((it, i) => `${i + 1}. [${it.source}] ${it.title}`)
    .join('\n');

  try {
    const { object } = await generateObject({
      model:       dgrid(AGENT_MODELS.pre_filter),
      schema:      PreFilterSchema,
      abortSignal: AbortSignal.timeout(20_000),
      prompt: `You are pre-filtering crypto news for a multi-chain developer (Solana, Ethereum, Arbitrum, Base, Polygon, Optimism).

From the headlines below, return the indexes (1-based) of the ${PREFILTER_KEEP} HIGHEST-signal items a crypto dev should read today.

Drop:
- generic price-action recaps ("X is up 5%")
- listicles / clickbait
- duplicate coverage of the same event (keep the most authoritative source)
- non-crypto items that slipped through

Keep:
- protocol updates, hacks, regulation, funding, infra/tooling launches
- chain-specific news that matters to a builder

Headlines:
${numbered}`,
    });
    const keep = new Set(object.keepIndexes);
    const filtered = input.filter((_, i) => keep.has(i + 1));
    // Append anything beyond PREFILTER_MAX_INPUT untouched (fail-open for tail items).
    return [...filtered, ...items.slice(PREFILTER_MAX_INPUT)];
  } catch (err) {
    console.warn('[news] pre-filter failed, processing all items:', (err as Error).message);
    return items;
  }
}

// ─── Run full news scan ───────────────────────────────────────────────────────

export async function runNewsScan(): Promise<{
  items: NewsItem[];
  scanned: number;
}> {
  // Fetch from all sources in parallel
  const [rssItems, cpItems] = await Promise.all([
    fetchRssFeeds(24),
    fetchCryptoPanicNews(24),
  ]);

  // Merge + deduplicate by URL
  const seen = new Set<string>();
  const raw: RssFeedItem[] = [];
  for (const item of [...rssItems, ...cpItems]) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      raw.push(item);
    }
  }

  // Free pre-filter step before paid Sonnet classifier — cuts paid load by ~60%.
  const filtered = await preFilterNews(raw);
  console.log(`[news] pre-filter: ${raw.length} → ${filtered.length} items for Sonnet classify`);

  // Classify in batches of 5
  const items: NewsItem[] = [];
  for (let i = 0; i < filtered.length; i += 5) {
    const batch = filtered.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(classifyNewsItem));
    for (const r of results) {
      if (r.status === 'fulfilled') items.push(r.value);
    }
  }

  // Sort: score desc
  items.sort((a, b) => b.score - a.score);

  return { items, scanned: raw.length };
}

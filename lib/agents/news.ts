import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';
import { fetchRssFeeds } from '@/lib/sources/rss';
import { fetchCryptoPanicNews } from '@/lib/sources/cryptopanic';
import type { RssFeedItem } from '@/lib/sources/rss';

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

  // Classify in batches of 5 (DeepSeek is fast enough)
  const items: NewsItem[] = [];
  for (let i = 0; i < raw.length; i += 5) {
    const batch = raw.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(classifyNewsItem));
    for (const r of results) {
      if (r.status === 'fulfilled') items.push(r.value);
    }
  }

  // Sort: score desc
  items.sort((a, b) => b.score - a.score);

  return { items, scanned: raw.length };
}

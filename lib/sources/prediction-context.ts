import { tavilySearch } from './tavily';
import { fetchRssFeeds, type RssFeedItem } from './rss';
import { fetchCryptoPanicNews } from './cryptopanic';
import { searchReddit } from './reddit';
import { searchTweets } from './twitter';

export interface PredictionContext {
  webSummary: string;
  newsHeadlines: string;
  redditSentiment: string;
  twitterBuzz: string;
}

const STOPWORDS = new Set([
  'will', 'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
  'than', 'does', 'what', 'when', 'who', 'which', 'win', 'lose', 'reach', 'hit',
  'above', 'below', 'over', 'under', 'most', 'least', 'more', 'less', 'end',
  'before', 'after', 'during', 'year', 'month', 'week', 'day', 'price',
]);

function relevanceScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function filterRelevant(items: RssFeedItem[], question: string, max = 6): RssFeedItem[] {
  const kws = extractKeywords(question);
  if (kws.length === 0) return items.slice(0, max);
  return items
    .map((item) => ({ item, score: relevanceScore(`${item.title} ${item.snippet}`, kws) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ item }) => item);
}

export async function buildPredictionContext(question: string): Promise<PredictionContext> {
  const [tavilyRes, rssRes, cryptoRes, redditRes, twitterRes] = await Promise.allSettled([
    tavilySearch(question, { maxResults: 5, topic: 'news' }),
    fetchRssFeeds(48),
    fetchCryptoPanicNews(48),
    searchReddit(question, { limit: 10, timeRange: 'week' }),
    searchTweets(question, 8),
  ]);

  // ── Web summary (Tavily) ─────────────────────────────────────────────────────
  let webSummary = 'No web context available.';
  if (tavilyRes.status === 'fulfilled') {
    const r = tavilyRes.value;
    const snippets = r.results
      .slice(0, 4)
      .map((s, i) => `[${i + 1}] ${s.title}\n    ${s.content.slice(0, 240)}`)
      .join('\n');
    webSummary = r.answer ? `${r.answer}\n\n${snippets}` : snippets || webSummary;
  }

  // ── News headlines (RSS + CryptoPanic, filtered by relevance) ────────────────
  let newsHeadlines = 'No relevant headlines found.';
  const allNews: RssFeedItem[] = [];
  if (rssRes.status === 'fulfilled') allNews.push(...rssRes.value);
  if (cryptoRes.status === 'fulfilled') allNews.push(...cryptoRes.value);
  const relevant = filterRelevant(allNews, question, 6);
  if (relevant.length > 0) {
    newsHeadlines = relevant
      .map((n) => `• [${n.source}] ${n.title}`)
      .join('\n');
  }

  // ── Reddit sentiment ─────────────────────────────────────────────────────────
  let redditSentiment = 'No Reddit signals.';
  if (redditRes.status === 'fulfilled' && redditRes.value.length > 0) {
    redditSentiment = redditRes.value
      .slice(0, 5)
      .map((p) => `• r/${p.subreddit} (↑${p.score} | ${p.numComments} comments): ${p.title}`)
      .join('\n');
  }

  // ── Twitter/X buzz ───────────────────────────────────────────────────────────
  let twitterBuzz = 'No Twitter/X signals (key not configured).';
  if (twitterRes.status === 'fulfilled' && twitterRes.value.length > 0) {
    twitterBuzz = twitterRes.value
      .slice(0, 5)
      .map((t) => `• @${t.author} (❤️${t.likeCount} 🔁${t.retweetCount}): ${t.text}`)
      .join('\n');
  }

  return { webSummary, newsHeadlines, redditSentiment, twitterBuzz };
}

export function formatContextBlock(ctx: PredictionContext): string {
  return `
━━━ LIVE MARKET INTELLIGENCE ━━━

[WEB SEARCH & NEWS SYNTHESIS]
${ctx.webSummary}

[CRYPTO NEWS HEADLINES (last 48h)]
${ctx.newsHeadlines}

[REDDIT COMMUNITY SIGNALS]
${ctx.redditSentiment}

[TWITTER/X BUZZ]
${ctx.twitterBuzz}
`.trim();
}

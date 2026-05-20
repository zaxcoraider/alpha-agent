import { tavilySearch } from './tavily';
import { fetchRssFeeds, type RssFeedItem } from './rss';
import { fetchCryptoPanicNews } from './cryptopanic';
import { searchReddit } from './reddit';
import { getGrokSocialSignal } from './grok-social';

export interface PredictionContext {
  webSummary: string;
  newsHeadlines: string;
  redditSentiment: string;
  xSocialSignal: string;   // Grok native X/Twitter analysis
}

const STOPWORDS = new Set([
  'will', 'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
  'than', 'does', 'what', 'when', 'who', 'which', 'win', 'lose', 'reach', 'hit',
  'above', 'below', 'over', 'under', 'most', 'least', 'more', 'less', 'end',
  'before', 'after', 'during', 'year', 'month', 'week', 'day', 'price',
]);

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
    .map((item) => ({
      item,
      score: kws.filter((kw) =>
        `${item.title} ${item.snippet}`.toLowerCase().includes(kw),
      ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ item }) => item);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function buildPredictionContext(question: string): Promise<PredictionContext> {
  const [tavilyRes, rssRes, cryptoRes, redditRes, grokRes] = await Promise.allSettled([
    withTimeout(tavilySearch(question, { maxResults: 5, topic: 'news' }), 12_000),
    withTimeout(fetchRssFeeds(48), 8_000),
    withTimeout(fetchCryptoPanicNews(48), 8_000),
    withTimeout(searchReddit(question, { limit: 10, timeRange: 'week' }), 8_000),
    withTimeout(getGrokSocialSignal(question), 22_000),
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

  // ── News headlines (RSS + CryptoPanic, keyword-filtered) ─────────────────────
  let newsHeadlines = 'No relevant headlines found.';
  const allNews: RssFeedItem[] = [];
  if (rssRes.status === 'fulfilled') allNews.push(...rssRes.value);
  if (cryptoRes.status === 'fulfilled') allNews.push(...cryptoRes.value);
  const relevant = filterRelevant(allNews, question, 6);
  if (relevant.length > 0) {
    newsHeadlines = relevant.map((n) => `• [${n.source}] ${n.title}`).join('\n');
  }

  // ── Reddit ───────────────────────────────────────────────────────────────────
  let redditSentiment = 'No Reddit signals.';
  if (redditRes.status === 'fulfilled' && redditRes.value.length > 0) {
    redditSentiment = redditRes.value
      .slice(0, 5)
      .map((p) => `• r/${p.subreddit} (↑${p.score} | ${p.numComments} comments): ${p.title}`)
      .join('\n');
  }

  // ── Grok X/Twitter signal ────────────────────────────────────────────────────
  let xSocialSignal = 'No X/Twitter signal available.';
  if (grokRes.status === 'fulfilled' && grokRes.value) {
    const g = grokRes.value;
    const scoreBar = g.sentimentScore >= 0
      ? `+${g.sentimentScore.toFixed(2)} → leans YES`
      : `${g.sentimentScore.toFixed(2)} → leans NO`;
    const narratives = g.topNarratives.map((n) => `  • ${n}`).join('\n');
    const accounts = g.keyAccounts.length > 0
      ? `Key voices: @${g.keyAccounts.join(', @')}`
      : '';
    xSocialSignal = `Sentiment: ${g.sentiment.toUpperCase()} | Score: ${scoreBar} | Volume: ${g.volumeTrend}
${g.summary}
Top narratives:
${narratives}${accounts ? `\n${accounts}` : ''}`;
  }

  return { webSummary, newsHeadlines, redditSentiment, xSocialSignal };
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

[X/TWITTER SOCIAL SIGNAL — powered by Grok]
${ctx.xSocialSignal}
`.trim();
}

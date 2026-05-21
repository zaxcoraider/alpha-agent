import { env } from '@/lib/env';

const BASE = 'https://api.tavily.com/search';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  answer?: string;
  results: TavilyResult[];
}

/**
 * Search for real-time web context on a topic.
 * Returns [] gracefully if TAVILY_API_KEY is not set (makes it opt-in).
 */
export async function tavilySearch(
  query: string,
  opts?: {
    maxResults?: number;       // default 5
    searchDepth?: 'basic' | 'advanced'; // default 'basic' (cheaper)
    topic?: 'general' | 'news'; // default 'news' for prediction context
  },
): Promise<TavilySearchResponse> {
  if (!env.TAVILY_API_KEY) return { results: [] };

  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: opts?.searchDepth ?? 'basic',
      max_results: opts?.maxResults ?? 5,
      topic: opts?.topic ?? 'news',
      include_answer: true,
    }),
  });

  if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);
  return res.json() as Promise<TavilySearchResponse>;
}

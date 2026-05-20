import { env } from '@/lib/env';

export interface Tweet {
  text: string;
  author: string;
  likeCount: number;
  retweetCount: number;
}

interface RawTweet {
  text?: string;
  author?: { userName?: string };
  likeCount?: number;
  retweetCount?: number;
}

/**
 * Search recent top tweets via twitterapi.io.
 * Returns [] gracefully if TWITTERAPI_IO_KEY is not set.
 */
export async function searchTweets(query: string, maxResults = 10): Promise<Tweet[]> {
  if (!env.TWITTERAPI_IO_KEY) return [];

  try {
    const url = new URL('https://api.twitterapi.io/twitter/tweet/advanced_search');
    url.searchParams.set('query', `${query} lang:en`);
    url.searchParams.set('queryType', 'Top');

    const res = await fetch(url.toString(), {
      headers: { 'X-API-Key': env.TWITTERAPI_IO_KEY },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.tweets ?? [] as RawTweet[])
      .slice(0, maxResults)
      .map((t: RawTweet) => ({
        text: (t.text ?? '').replace(/https?:\/\/\S+/g, '').trim().slice(0, 280),
        author: t.author?.userName ?? 'unknown',
        likeCount: t.likeCount ?? 0,
        retweetCount: t.retweetCount ?? 0,
      }));
  } catch {
    return [];
  }
}

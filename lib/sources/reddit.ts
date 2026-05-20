export interface RedditPost {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  snippet: string;
}

interface RedditChild {
  data: {
    title: string;
    permalink: string;
    subreddit: string;
    score: number;
    num_comments: number;
    selftext?: string;
  };
}

export async function searchReddit(
  query: string,
  opts?: {
    limit?: number;
    timeRange?: 'day' | 'week' | 'month';
  },
): Promise<RedditPost[]> {
  const limit = opts?.limit ?? 10;
  const t = opts?.timeRange ?? 'week';

  const url = new URL('https://www.reddit.com/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('t', t);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('type', 'link');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'AlphaAgent/1.0 (+https://github.com/zaxcoraider/alpha-agent)' },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data?.data?.children ?? [] as RedditChild[])
      .map((child: RedditChild) => {
        const p = child.data;
        return {
          title: p.title,
          url: `https://reddit.com${p.permalink}`,
          subreddit: p.subreddit,
          score: p.score ?? 0,
          numComments: p.num_comments ?? 0,
          snippet: (p.selftext ?? '').slice(0, 250),
        };
      })
      .filter((p: RedditPost) => p.score > 0);
  } catch {
    return [];
  }
}

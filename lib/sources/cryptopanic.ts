import type { RssFeedItem } from './rss';
import { env } from '@/lib/env';

interface CryptoPanicPost {
  title: string;
  url: string;
  published_at: string;
  source: { title: string };
}

interface CryptoPanicResponse {
  results: CryptoPanicPost[];
  next: string | null;
}

export async function fetchCryptoPanicNews(maxAgeHours = 24): Promise<RssFeedItem[]> {
  const token = env.CRYPTOPANIC_TOKEN;
  if (!token) return [];

  const cutoff = Date.now() - maxAgeHours * 3_600_000;
  const url = new URL('https://cryptopanic.com/api/free/v1/posts/');
  url.searchParams.set('auth_token', token);
  url.searchParams.set('kind', 'news');
  url.searchParams.set('filter', 'hot');
  url.searchParams.set('public', 'true');

  const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
  if (!res.ok) return [];

  const data: CryptoPanicResponse = await res.json();

  return data.results
    .filter((p) => new Date(p.published_at).getTime() >= cutoff)
    .map((p) => ({
      title: p.title,
      url: p.url,
      source: `CryptoPanic / ${p.source.title}`,
      publishedAt: new Date(p.published_at).toISOString(),
      snippet: '',
    }));
}

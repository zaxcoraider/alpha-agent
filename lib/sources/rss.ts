export interface RssFeedItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO string
  snippet: string;     // plain text, max ~300 chars
}

// Curated crypto news RSS feeds — no auth required
const FEEDS = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed' },
  { name: 'The Block',     url: 'https://www.theblock.co/rss.xml' },
  { name: 'DLNews',        url: 'https://www.dlnews.com/arc/outboundfeeds/rss/' },
  { name: 'Blockworks',    url: 'https://blockworks.co/feed' },
];

function extractTag(xml: string, tag: string): string {
  // Handles <tag>, <tag attr="...">, and CDATA
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    'i'
  );
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function parseDate(raw: string): string {
  try {
    return new Date(raw).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function parseRssXml(xml: string, sourceName: string): RssFeedItem[] {
  const items: RssFeedItem[] = [];

  // RSS 2.0: <item>...</item>
  const rssItemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = rssItemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = stripHtml(extractTag(block, 'title'));
    const link = extractTag(block, 'link') || extractAttr(block, 'link', 'href');
    const desc = stripHtml(extractTag(block, 'description') || extractTag(block, 'content:encoded'));
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    if (!title || !link) continue;
    items.push({
      title,
      url: link,
      source: sourceName,
      publishedAt: parseDate(pubDate),
      snippet: desc.slice(0, 300),
    });
  }

  // Atom: <entry>...</entry>
  if (items.length === 0) {
    const atomRe = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((m = atomRe.exec(xml)) !== null) {
      const block = m[1];
      const title = stripHtml(extractTag(block, 'title'));
      const link = extractAttr(block, 'link', 'href') || extractTag(block, 'id');
      const desc = stripHtml(extractTag(block, 'summary') || extractTag(block, 'content'));
      const pubDate = extractTag(block, 'updated') || extractTag(block, 'published');
      if (!title || !link) continue;
      items.push({
        title,
        url: link,
        source: sourceName,
        publishedAt: parseDate(pubDate),
        snippet: desc.slice(0, 300),
      });
    }
  }

  return items;
}

export async function fetchRssFeeds(maxAgeHours = 24): Promise<RssFeedItem[]> {
  const cutoff = Date.now() - maxAgeHours * 3_600_000;
  const results = await Promise.allSettled(
    FEEDS.map(async ({ name, url }) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AlphaAgent/1.0 (+https://github.com/zaxcoraider/alpha-agent)' },
        next: { revalidate: 1800 }, // 30-min cache
      });
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      const xml = await res.text();
      return parseRssXml(xml, name);
    })
  );

  const all: RssFeedItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Filter to max age + deduplicate by URL
  const seen = new Set<string>();
  return all
    .filter((item) => {
      const ts = new Date(item.publishedAt).getTime();
      if (ts < cutoff || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

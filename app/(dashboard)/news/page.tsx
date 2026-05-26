import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RescanButton } from './rescan-button';
import { NewsClient } from './news-client';
import type { NewsItem } from '@/lib/agents/news';

async function getNews() {
  try {
    const rows = await db
      .select()
      .from(scanResults)
      .where(eq(scanResults.agent, 'news'))
      .orderBy(desc(scanResults.createdAt))
      .limit(100);

    const lastRun = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.agent, 'news'))
      .orderBy(desc(scanRuns.startedAt))
      .limit(1);

    return {
      items: rows.map((r) => r.raw as NewsItem),
      lastRun: lastRun[0] ?? null,
    };
  } catch {
    return { items: [], lastRun: null };
  }
}

export default async function NewsPage() {
  const { items, lastRun } = await getNews();

  const lastScan = lastRun?.finishedAt
    ? new Date(lastRun.finishedAt).toLocaleString()
    : null;

  const highScore = items.filter((i) => i.score >= 8).length;
  const hacks = items.filter((i) => i.category === 'hack').length;
  const sources = [...new Set(items.map((i) => i.source))].length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">News</h1>
          <p className="text-sm text-muted-foreground">
            RSS + CryptoPanic · DeepSeek classifier · every 30 min
            {lastScan && <span> · Last scan: {lastScan}</span>}
          </p>
        </div>
        <RescanButton agent="news" />
      </div>

      {/* Stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold">{items.length}</p>
            <p className="text-xs text-muted-foreground">Articles</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{highScore}</p>
            <p className="text-xs text-muted-foreground">Score ≥ 8</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-red-400">{hacks}</p>
            <p className="text-xs text-muted-foreground">Hacks / exploits</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{sources}</p>
            <p className="text-xs text-muted-foreground">Sources</p>
          </div>
        </div>
      )}

      {/* News list (client for filtering) */}
      {items.length > 0 ? (
        <NewsClient items={items} />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-16 text-center text-muted-foreground">
          <p className="text-sm">No news yet.</p>
          <p className="text-xs mt-1">
            Make sure Postgres is running (<code>docker-compose up -d</code>
            {' + '}
            <code>npm run db:push</code>), then click Scan.
          </p>
          <p className="text-xs mt-1">
            Optionally set <code>CRYPTOPANIC_TOKEN</code> in <code>.env.local</code> for more sources.
          </p>
        </div>
      )}
    </div>
  );
}

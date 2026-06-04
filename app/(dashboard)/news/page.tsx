import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RescanButton } from './rescan-button';
import { NewsClient } from './news-client';
import { PageHeader, StatGrid, Stat, EmptyState } from '@/components/ui/hud';
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
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="News"
        title="News"
        subtitle="RSS + CryptoPanic · Llama pre-filter → Sonnet classifier · every 4h"
        meta={lastScan ? `last scan ${lastScan}` : undefined}
        actions={<RescanButton agent="news" />}
      />

      {/* Stats */}
      {items.length > 0 && (
        <StatGrid>
          <Stat value={items.length} label="Articles"        tone="default"  />
          <Stat value={highScore}    label="Score ≥ 8"       tone="signal"   />
          <Stat value={hacks}        label="Hacks / exploits" tone="critical" />
          <Stat value={sources}      label="Sources"          tone="blue"     />
        </StatGrid>
      )}

      {/* News list (client for filtering) */}
      {items.length > 0 ? (
        <NewsClient items={items} />
      ) : (
        <EmptyState
          title="No news yet."
          hint={<>Click <strong className="text-muted-foreground">Scan Now</strong> to fetch and classify the latest crypto headlines.</>}
        />
      )}
    </div>
  );
}

import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { MemeToken } from '@/lib/agents/memes';
import { MemesClient } from './memes-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';
import { PageHeader, EmptyState } from '@/components/ui/hud';

async function getTokens(): Promise<MemeToken[]> {
  try {
    const rows = await db
      .select({ raw: scanResults.raw, createdAt: scanResults.createdAt })
      .from(scanResults)
      .where(eq(scanResults.agent, 'memes'))
      .orderBy(desc(scanResults.createdAt))
      .limit(60);

    return rows.map((r) => r.raw as MemeToken).filter(Boolean);
  } catch {
    return [];
  }
}

async function getLastRun() {
  try {
    const [run] = await db
      .select({ finishedAt: scanRuns.finishedAt, status: scanRuns.status, itemsFound: scanRuns.itemsFound })
      .from(scanRuns)
      .where(eq(scanRuns.agent, 'memes'))
      .orderBy(desc(scanRuns.finishedAt))
      .limit(1);
    return run ?? null;
  } catch {
    return null;
  }
}

export default async function MemesPage() {
  const [tokens, lastRun] = await Promise.all([getTokens(), getLastRun()]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Meme Radar"
        title="Meme Radar"
        subtitle="Grok CT scan + DexScreener · SOL, ETH, BASE, BNB · gem scoring + rug detection · every 2h"
        meta={lastRun?.finishedAt
          ? `last scan ${new Date(lastRun.finishedAt).toLocaleString()} · ${lastRun.itemsFound ?? 0} tokens scanned`
          : undefined}
        actions={<RescanButton agent="memes" />}
      />

      {tokens.length === 0 ? (
        <EmptyState
          title="No meme tokens yet."
          hint={<>Click <strong className="text-muted-foreground">Scan Now</strong> to trigger a scan, or wait for the automatic 2-hour cron.</>}
        />
      ) : (
        <MemesClient tokens={tokens} />
      )}
    </div>
  );
}

import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { NFTMint } from '@/lib/agents/nft-mints';
import { MintsClient } from './mints-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';
import { PageHeader, EmptyState } from '@/components/ui/hud';

async function getMints(): Promise<NFTMint[]> {
  try {
    const rows = await db
      .select({ raw: scanResults.raw, createdAt: scanResults.createdAt })
      .from(scanResults)
      .where(eq(scanResults.agent, 'nft'))
      .orderBy(desc(scanResults.createdAt))
      .limit(60);

    return rows
      .map((r) => r.raw as NFTMint)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getLastRun() {
  try {
    const [run] = await db
      .select({ finishedAt: scanRuns.finishedAt, status: scanRuns.status, itemsFound: scanRuns.itemsFound })
      .from(scanRuns)
      .where(eq(scanRuns.agent, 'nft'))
      .orderBy(desc(scanRuns.finishedAt))
      .limit(1);
    return run ?? null;
  } catch {
    return null;
  }
}

export default async function NftMintsPage() {
  const [mints, lastRun] = await Promise.all([getMints(), getLastRun()]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="NFT Mints"
        title="NFT Mints"
        subtitle="Early-alpha NFT mints from CT, Reservoir & Magic Eden · every 4h"
        meta={lastRun?.finishedAt
          ? `last scan ${new Date(lastRun.finishedAt).toLocaleString()} · ${lastRun.itemsFound ?? 0} projects scanned`
          : undefined}
        actions={<RescanButton agent="nft_mints" />}
      />

      {mints.length === 0 ? (
        <EmptyState
          title="No NFT mints yet."
          hint={<>Click <strong className="text-muted-foreground">Scan Now</strong> to trigger a scan, or wait for the automatic 4-hour cron.</>}
        />
      ) : (
        <MintsClient mints={mints} />
      )}
    </div>
  );
}

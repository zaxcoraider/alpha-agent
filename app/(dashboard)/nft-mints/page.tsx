import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { NFTMint } from '@/lib/agents/nft-mints';
import { MintsClient } from './mints-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';

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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">NFT Mints</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Early-alpha NFT mints from CT, Reservoir & Magic Eden · scans every 15 min
          </p>
          {lastRun?.finishedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last scan: {new Date(lastRun.finishedAt).toLocaleString()} ·{' '}
              {lastRun.itemsFound ?? 0} projects scanned
            </p>
          )}
        </div>
        <RescanButton agent="nft_mints" />
      </div>

      {mints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground text-sm mb-2">No NFT mints in the database yet.</p>
          <p className="text-muted-foreground text-xs">
            Click <span className="font-mono bg-white/5 px-1 rounded">Rescan</span> to trigger a scan, or wait for the
            automatic 15-minute cron job. Requires a running Postgres instance.
          </p>
        </div>
      ) : (
        <MintsClient mints={mints} />
      )}
    </div>
  );
}

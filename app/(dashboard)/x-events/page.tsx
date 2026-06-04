import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { XEvent } from '@/lib/agents/x-events';
import { XEventsClient } from './x-events-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';
import { PageHeader, EmptyState } from '@/components/ui/hud';

async function getEvents(): Promise<XEvent[]> {
  try {
    const rows = await db
      .select({ raw: scanResults.raw, createdAt: scanResults.createdAt })
      .from(scanResults)
      .where(eq(scanResults.agent, 'x_events'))
      .orderBy(desc(scanResults.createdAt))
      .limit(60);

    return rows.map((r) => r.raw as XEvent).filter(Boolean);
  } catch {
    return [];
  }
}

async function getLastRun() {
  try {
    const [run] = await db
      .select({ finishedAt: scanRuns.finishedAt, status: scanRuns.status, itemsFound: scanRuns.itemsFound })
      .from(scanRuns)
      .where(eq(scanRuns.agent, 'x_events'))
      .orderBy(desc(scanRuns.finishedAt))
      .limit(1);
    return run ?? null;
  } catch {
    return null;
  }
}

export default async function XEventsPage() {
  const [events, lastRun] = await Promise.all([getEvents(), getLastRun()]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="X Events"
        title="X Events"
        subtitle="Spaces · Viral Threads · KOL Alerts · Airdrops · Token Unlocks · Listings · every 2h"
        meta={lastRun?.finishedAt
          ? `last scan ${new Date(lastRun.finishedAt).toLocaleString()} · ${lastRun.itemsFound ?? 0} events scanned`
          : undefined}
        actions={<RescanButton agent="x_events" />}
      />

      {events.length === 0 ? (
        <EmptyState
          title="No X events yet."
          hint={<>Click <strong className="text-muted-foreground">Scan Now</strong> to trigger a scan, or wait for the automatic 2-hour cron.</>}
        />
      ) : (
        <XEventsClient events={events} />
      )}
    </div>
  );
}

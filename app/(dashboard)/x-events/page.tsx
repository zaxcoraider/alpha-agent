import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { XEvent } from '@/lib/agents/x-events';
import { XEventsClient } from './x-events-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';

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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">X Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spaces · Viral Threads · KOL Alerts · Airdrops · Token Unlocks · Listings · scans every hour
          </p>
          {lastRun?.finishedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last scan: {new Date(lastRun.finishedAt).toLocaleString()} ·{' '}
              {lastRun.itemsFound ?? 0} events scanned
            </p>
          )}
        </div>
        <RescanButton agent="x_events" />
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground text-sm mb-2">No X events in the database yet.</p>
          <p className="text-muted-foreground text-xs">
            Click <span className="font-mono bg-white/5 px-1 rounded">Rescan</span> to trigger a scan,
            or wait for the automatic hourly cron job. Requires a running Postgres instance.
          </p>
        </div>
      ) : (
        <XEventsClient events={events} />
      )}
    </div>
  );
}

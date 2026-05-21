import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { EventsClient } from './events-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';
import type { ProcessedOpportunity } from '@/lib/agents/dev-events';

async function getEvents() {
  try {
    const [rows, runs] = await Promise.all([
      db.select().from(scanResults)
        .where(eq(scanResults.agent, 'dev_events'))
        .orderBy(desc(scanResults.createdAt))
        .limit(200),
      db.select().from(scanRuns)
        .where(eq(scanRuns.agent, 'dev_events'))
        .orderBy(desc(scanRuns.startedAt))
        .limit(1),
    ]);
    return {
      opportunities: rows.map((r) => r.raw as ProcessedOpportunity).filter(Boolean),
      lastRun: runs[0] ?? null,
    };
  } catch {
    return { opportunities: [], lastRun: null };
  }
}

export default async function DevEventsPage() {
  const { opportunities, lastRun } = await getEvents();

  const lastScan = lastRun?.finishedAt
    ? new Date(lastRun.finishedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dev Events</h1>
          <p className="text-sm text-muted-foreground">
            Hackathons · Grants · Bounties · Audits · Grok + Tavily · every 2h
            {lastScan && <span> · Last scan: {lastScan}</span>}
          </p>
        </div>
        <RescanButton agent="dev_events" />
      </div>

      {opportunities.length > 0 ? (
        <EventsClient opportunities={opportunities} />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground space-y-2">
          <p className="text-sm">No opportunities yet.</p>
          <p className="text-xs">
            Make sure Postgres is running and <code className="text-xs bg-muted/40 px-1 rounded">npm run db:push</code> was run,
            then click <strong>Scan Now</strong>.
          </p>
          <p className="text-xs opacity-60">
            Set <code className="bg-muted/40 px-1 rounded">TAVILY_API_KEY</code> and configure Grok via DGrid for best results.
          </p>
        </div>
      )}
    </div>
  );
}

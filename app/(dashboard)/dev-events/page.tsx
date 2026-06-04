import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { EventsClient } from './events-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';
import { PageHeader, EmptyState } from '@/components/ui/hud';
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
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Dev Events"
        title="Dev Events"
        subtitle="Hackathons · Grants · Bounties · Audits · Grok + Tavily · every 8h"
        meta={lastScan ? `last scan ${lastScan}` : undefined}
        actions={<RescanButton agent="dev_events" />}
      />

      {opportunities.length > 0 ? (
        <EventsClient opportunities={opportunities} />
      ) : (
        <EmptyState
          title="No opportunities yet."
          hint={<>Click <strong className="text-muted-foreground">Scan Now</strong> to surface hackathons, grants, bounties and audits.</>}
        />
      )}
    </div>
  );
}

import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { Idea, WeeklyReport } from '@/lib/agents/ideas';
import { IdeasClient } from './ideas-client';
import { PageHeader, EmptyState } from '@/components/ui/hud';

async function getData(): Promise<{ ideas: Idea[]; weeklyReport: WeeklyReport | null }> {
  try {
    const rows = await db
      .select({ raw: scanResults.raw, externalId: scanResults.externalId })
      .from(scanResults)
      .where(eq(scanResults.agent, 'ideas'))
      .orderBy(desc(scanResults.createdAt))
      .limit(60);

    let weeklyReport: WeeklyReport | null = null;
    const ideas: Idea[] = [];

    for (const row of rows) {
      const raw = row.raw as { type?: string } & Record<string, unknown>;
      if (raw?.type === 'weekly_report') {
        weeklyReport ??= raw as unknown as WeeklyReport;
      } else if (raw?.type && ['build', 'trade', 'narrative'].includes(raw.type as string)) {
        ideas.push(raw as unknown as Idea);
      }
    }

    return { ideas, weeklyReport };
  } catch {
    return { ideas: [], weeklyReport: null };
  }
}

async function getLastRun() {
  try {
    const [run] = await db
      .select({ finishedAt: scanRuns.finishedAt, itemsFound: scanRuns.itemsFound })
      .from(scanRuns)
      .where(eq(scanRuns.agent, 'ideas'))
      .orderBy(desc(scanRuns.finishedAt))
      .limit(1);
    return run ?? null;
  } catch {
    return null;
  }
}

export default async function IdeasPage() {
  const [{ ideas, weeklyReport }, lastRun] = await Promise.all([getData(), getLastRun()]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Alpha Ideas"
        title="Alpha Ideas"
        subtitle="Synthesis layer — Build, Trade & Narrative ideas generated from all scanners · Opus ×3 + o3-pro · every 6h"
        meta={
          lastRun?.finishedAt
            ? `last synthesis ${new Date(lastRun.finishedAt).toLocaleString()} · ${lastRun.itemsFound ?? 0} ideas`
            : undefined
        }
      />

      {ideas.length === 0 && !weeklyReport ? (
        <EmptyState
          title="No ideas synthesized yet."
          hint={
            <>
              Click <strong className="text-muted-foreground">Scan</strong> on a section to run the synthesis.
              Requires other scanners to have run first (news, memes, nft, x_events).
            </>
          }
        />
      ) : (
        <IdeasClient ideas={ideas} weeklyReport={weeklyReport} />
      )}
    </div>
  );
}

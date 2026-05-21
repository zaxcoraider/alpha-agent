import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { Idea, WeeklyReport } from '@/lib/agents/ideas';
import { IdeasClient } from './ideas-client';
import { RescanButton } from '@/app/(dashboard)/news/rescan-button';

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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Alpha Ideas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Synthesis layer — Build, Trade &amp; Narrative ideas generated from all scanners · every 6 hours
          </p>
          {lastRun?.finishedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last synthesis: {new Date(lastRun.finishedAt).toLocaleString()} ·{' '}
              {lastRun.itemsFound ?? 0} ideas generated
            </p>
          )}
        </div>
        <RescanButton agent="ideas" />
      </div>

      {ideas.length === 0 && !weeklyReport ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground text-sm mb-2">No ideas synthesized yet.</p>
          <p className="text-muted-foreground text-xs">
            Click <span className="font-mono bg-white/5 px-1 rounded">Rescan</span> to run the synthesis.
            Requires other scanners to have run first (news, memes, nft, x_events).
          </p>
        </div>
      ) : (
        <IdeasClient ideas={ideas} weeklyReport={weeklyReport} />
      )}
    </div>
  );
}

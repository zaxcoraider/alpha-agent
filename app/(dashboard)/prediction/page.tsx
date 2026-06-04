import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RescanButton } from './rescan-button';
import { PredictForm } from './predict-form';
import { PredictionCard } from './prediction-card';
import { BarChart2 } from 'lucide-react';
import { PageHeader, StatGrid, Stat, EmptyState } from '@/components/ui/hud';
import type { Prediction } from '@/lib/agents/prediction';

async function getPredictions() {
  try {
    const rows = await db
      .select()
      .from(scanResults)
      .where(eq(scanResults.agent, 'prediction'))
      .orderBy(desc(scanResults.createdAt))
      .limit(50);

    const lastRun = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.agent, 'prediction'))
      .orderBy(desc(scanRuns.startedAt))
      .limit(1);

    const scanPredictions   = rows.filter((r) => !r.externalId.startsWith('custom-'));
    const customPredictions = rows.filter((r) =>  r.externalId.startsWith('custom-'));

    return {
      predictions:       scanPredictions.map((r) => r.raw as Prediction),
      customPredictions: customPredictions.map((r) => r.raw as Prediction),
      lastRun:           lastRun[0] ?? null,
    };
  } catch {
    return { predictions: [], customPredictions: [], lastRun: null };
  }
}

export default async function PredictionPage() {
  const { predictions, customPredictions, lastRun } = await getPredictions();

  const withEdge      = predictions.filter((p) => p.recommendedSide !== 'SKIP');
  const skipped       = predictions.filter((p) => p.recommendedSide === 'SKIP');
  const lastScan      = lastRun?.finishedAt
    ? new Date(lastRun.finishedAt).toLocaleString()
    : null;
  const avgEdge       = withEdge.length > 0
    ? Math.round(withEdge.reduce((s, p) => s + p.edge, 0) / withEdge.length * 100)
    : 0;
  const totalAnalysts = predictions.reduce((s, p) => s + (p.analystCount ?? 1), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Prediction Markets"
        title="Prediction Markets"
        subtitle="Polymarket · Kalshi · 12-analyst ensemble · Grok X · MiroFish swarm"
        meta={lastScan ? `last scan ${lastScan}` : undefined}
        actions={<RescanButton agent="prediction" />}
      />

      {/* Custom prediction input */}
      <PredictForm />

      {/* Stats */}
      {predictions.length > 0 && (
        <StatGrid>
          <Stat value={predictions.length} label="Markets scanned" tone="default" />
          <Stat value={withEdge.length}    label="Edges found"     tone="signal"  />
          <Stat value={`${avgEdge}%`}      label="Avg edge"        tone="amber" pad={false} />
          <Stat value={totalAnalysts}      label="Analyst calls"   tone="blue"    />
        </StatGrid>
      )}

      {/* Custom predictions */}
      {customPredictions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-violet-400">
              Your Custom Predictions
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">[{String(customPredictions.length).padStart(2, '0')}]</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {customPredictions.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </section>
      )}

      {/* Edge opportunities */}
      {withEdge.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse-dot" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-signal">
              Edge Opportunities
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">[{String(withEdge.length).padStart(2, '0')}]</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {withEdge.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </section>
      )}

      {/* No edge */}
      {skipped.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
              No Edge
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">[{String(skipped.length).padStart(2, '0')}]</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {skipped.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {predictions.length === 0 && customPredictions.length === 0 && (
        <EmptyState
          icon={<BarChart2 size={20} />}
          title="No predictions yet"
          hint={<>Type a question above to analyze anything, or click <strong className="text-muted-foreground">Scan Now</strong> to scan Polymarket + Kalshi.</>}
        />
      )}
    </div>
  );
}

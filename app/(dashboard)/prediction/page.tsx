import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RescanButton } from './rescan-button';
import { PredictForm } from './predict-form';
import { PredictionCard } from './prediction-card';
import { BarChart2, TrendingUp, Target, Users } from 'lucide-react';
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

function StatCard({ icon: Icon, value, label, color = 'text-foreground' }: {
  icon: React.ElementType; value: string | number; label: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <div>
        <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
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
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prediction Markets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Polymarket · Kalshi · 10-analyst ensemble · Grok X · MiroFish swarm
            {lastScan && <span className="text-muted-foreground/50"> · Last scan: {lastScan}</span>}
          </p>
        </div>
        <RescanButton agent="prediction" />
      </div>

      {/* Custom prediction input */}
      <PredictForm />

      {/* Stats */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={BarChart2} value={predictions.length} label="Markets scanned" />
          <StatCard icon={Target}    value={withEdge.length}    label="Edges found"       color="text-emerald-400" />
          <StatCard icon={TrendingUp} value={`${avgEdge}%`}    label="Avg edge"           color="text-yellow-400" />
          <StatCard icon={Users}     value={totalAnalysts}      label="Analyst calls"      color="text-blue-400" />
        </div>
      )}

      {/* Custom predictions */}
      {customPredictions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            <h2 className="text-sm font-semibold text-violet-400">
              Your Custom Predictions ({customPredictions.length})
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {customPredictions.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </section>
      )}

      {/* Edge opportunities */}
      {withEdge.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-emerald-400">
              Edge Opportunities ({withEdge.length})
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {withEdge.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </section>
      )}

      {/* No edge */}
      {skipped.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            <h2 className="text-sm font-semibold text-muted-foreground">
              No Edge ({skipped.length})
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {skipped.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {predictions.length === 0 && customPredictions.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="h-12 w-12 rounded-xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
            <BarChart2 size={20} className="text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">No predictions yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1.5">
            Type a question above to analyze anything, or click{' '}
            <strong className="text-muted-foreground">Scan Now</strong> to scan Polymarket + Kalshi.
          </p>
        </div>
      )}

    </div>
  );
}

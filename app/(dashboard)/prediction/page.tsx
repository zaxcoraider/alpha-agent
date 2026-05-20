import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq, not, like } from 'drizzle-orm';
import { RescanButton } from './rescan-button';
import { PredictForm } from './predict-form';
import { PredictionCard } from './prediction-card';
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

    // Separate scan results from custom predictions (custom- prefix)
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

  const withEdge   = predictions.filter((p) => p.recommendedSide !== 'SKIP');
  const skipped    = predictions.filter((p) => p.recommendedSide === 'SKIP');
  const lastScan   = lastRun?.finishedAt
    ? new Date(lastRun.finishedAt).toLocaleString()
    : null;
  const totalAnalysts = predictions.reduce((s, p) => s + (p.analystCount ?? 1), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prediction Markets</h1>
          <p className="text-sm text-muted-foreground">
            Polymarket · Kalshi · 10-analyst ensemble · Grok X · MiroFish swarm · DGrid
            {lastScan && <span> · Last scan: {lastScan}</span>}
          </p>
        </div>
        <RescanButton agent="prediction" />
      </div>

      {/* Custom prediction input */}
      <PredictForm />

      {/* Past custom predictions */}
      {customPredictions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-violet-400">
            Your Custom Predictions ({customPredictions.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {customPredictions.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </div>
      )}

      {/* Stats */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold">{predictions.length}</p>
            <p className="text-xs text-muted-foreground">Markets scanned</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{withEdge.length}</p>
            <p className="text-xs text-muted-foreground">Edges found</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-yellow-400">
              {withEdge.length > 0
                ? Math.round(withEdge.reduce((s, p) => s + p.edge, 0) / withEdge.length * 100)
                : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Avg edge</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{totalAnalysts}</p>
            <p className="text-xs text-muted-foreground">Total analyst calls</p>
          </div>
        </div>
      )}

      {/* Edge opportunities */}
      {withEdge.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-emerald-400">
            Edge Opportunities ({withEdge.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {withEdge.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </div>
      )}

      {/* Skipped */}
      {skipped.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">
            No Edge ({skipped.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {skipped.map((p) => <PredictionCard key={p.marketId} p={p} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {predictions.length === 0 && customPredictions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-16 text-center text-muted-foreground">
          <p className="text-sm">No predictions yet.</p>
          <p className="text-xs mt-1">
            Type a question above, or click <strong>Scan Now</strong> to scan Polymarket + Kalshi.
          </p>
        </div>
      )}
    </div>
  );
}

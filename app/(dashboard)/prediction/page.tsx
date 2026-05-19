import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RescanButton } from './rescan-button';
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

    return {
      predictions: rows.map((r) => r.raw as Prediction),
      lastRun: lastRun[0] ?? null,
    };
  } catch {
    return { predictions: [], lastRun: null };
  }
}

function EdgeBadge({ edge, side }: { edge: number; side: string }) {
  if (side === 'SKIP') return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">SKIP</span>
  );
  const pct = Math.round(edge * 100);
  const color = pct >= 20 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>
      {side} +{pct}% edge
    </span>
  );
}

function ProbBar({ marketProb, yourProb }: { marketProb: number; yourProb: number }) {
  const market = Math.round(marketProb * 100);
  const yours = Math.round(yourProb * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16">Market</span>
        <div className="flex-1 rounded-full bg-muted h-1.5">
          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${market}%` }} />
        </div>
        <span className="w-8 text-right">{market}%</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16">Analyst</span>
        <div className="flex-1 rounded-full bg-muted h-1.5">
          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${yours}%` }} />
        </div>
        <span className="w-8 text-right">{yours}%</span>
      </div>
    </div>
  );
}

function PredictionCard({ p }: { p: Prediction }) {
  const daysLabel = p.daysLeft === 1 ? '1 day' : `${p.daysLeft} days`;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug">{p.question}</p>
        <EdgeBadge edge={p.edge} side={p.recommendedSide} />
      </div>

      {/* Prob bars */}
      <ProbBar marketProb={p.marketProb} yourProb={p.yourProb} />

      {/* Evidence */}
      {p.keyEvidence?.length > 0 && (
        <ul className="space-y-1">
          {p.keyEvidence.map((e, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 text-emerald-500">›</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2">
        <span>Vol ${(p.volumeUsd / 1000).toFixed(0)}k</span>
        <span>·</span>
        <span>Conf {Math.round(p.confidence * 100)}%</span>
        <span>·</span>
        <span>{daysLabel} left</span>
      </div>
    </div>
  );
}

export default async function PredictionPage() {
  const { predictions, lastRun } = await getPredictions();

  const withEdge = predictions.filter((p) => p.recommendedSide !== 'SKIP');
  const skipped = predictions.filter((p) => p.recommendedSide === 'SKIP');
  const lastScan = lastRun?.finishedAt
    ? new Date(lastRun.finishedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prediction Markets</h1>
          <p className="text-sm text-muted-foreground">
            Polymarket · edge detection · MiroFish analyst pipeline
            {lastScan && <span> · Last scan: {lastScan}</span>}
          </p>
        </div>
        <RescanButton agent="prediction" />
      </div>

      {/* Stats */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
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
      {predictions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-16 text-center text-muted-foreground">
          <p className="text-sm">No predictions yet.</p>
          <p className="text-xs mt-1">
            Make sure Postgres is running (<code>docker-compose up -d</code>
            {' + '}
            <code>npm run db:push</code>), then click Scan.
          </p>
        </div>
      )}
    </div>
  );
}

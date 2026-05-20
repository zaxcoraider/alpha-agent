import type { Prediction } from '@/lib/agents/prediction';

export function EdgeBadge({ edge, side }: { edge: number; side: string }) {
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

export function ProbBar({ label, prob, color }: { label: string; prob: number; color: string }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-16 shrink-0">{label}</span>
      <div className="flex-1 rounded-full bg-muted h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right">{pct}%</span>
    </div>
  );
}

export function AnalystRow({ analyst }: {
  analyst: { role: string; yourProb: number; confidence: number; headline: string }
}) {
  const pct      = Math.round(analyst.yourProb * 100);
  const conf     = Math.round(analyst.confidence * 100);
  const barColor = conf >= 70 ? 'bg-emerald-500' : conf >= 50 ? 'bg-yellow-500' : 'bg-muted-foreground';
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
      <span className="text-muted-foreground font-medium">{analyst.role}</span>
      <span className="text-right font-mono tabular-nums">{pct}% · {conf}% conf</span>
      <span className="text-muted-foreground/70 col-span-2 truncate">{analyst.headline}</span>
      <div className="col-span-2 rounded-full bg-muted h-1 mt-0.5">
        <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const styles: Record<string, string> = {
    polymarket: 'bg-blue-500/15 text-blue-400',
    kalshi:     'bg-orange-500/15 text-orange-400',
    metaculus:  'bg-teal-500/15 text-teal-400',
    custom:     'bg-violet-500/15 text-violet-400',
  };
  const labels: Record<string, string> = {
    polymarket: 'Polymarket',
    kalshi:     'Kalshi',
    metaculus:  'Metaculus',
    custom:     'Custom',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${styles[source] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[source] ?? source}
    </span>
  );
}

export function PredictionCard({ p }: { p: Prediction }) {
  const daysLabel    = p.daysLeft === 1 ? '1 day' : `${p.daysLeft} days`;
  const hasBreakdown = p.analystBreakdown && p.analystBreakdown.length > 0;

  return (
    <div className={`rounded-lg border bg-card p-4 space-y-3 ${p.miroFishEnhanced ? 'border-purple-500/40' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium leading-snug">{p.question}</p>
          <SourceBadge source={p.source} />
          {p.miroFishEnhanced && (
            <span className="rounded-full bg-purple-500/15 text-purple-400 px-2 py-0.5 text-xs font-semibold shrink-0">
              MiroFish
            </span>
          )}
        </div>
        <EdgeBadge edge={p.edge} side={p.recommendedSide} />
      </div>

      <div className="space-y-1">
        <ProbBar label="Market"    prob={p.marketProb} color="bg-blue-500" />
        <ProbBar label="Ensemble"  prob={p.yourProb}   color="bg-emerald-500" />
      </div>

      {hasBreakdown && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 select-none list-none">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            <span>{p.analystCount ?? p.analystBreakdown!.length} analysts · click to expand</span>
          </summary>
          <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
            {p.analystBreakdown!.map((a) => (
              <AnalystRow key={a.role} analyst={a} />
            ))}
          </div>
        </details>
      )}

      {p.keyEvidence?.length > 0 && (
        <ul className="space-y-1">
          {p.keyEvidence.map((e, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 text-emerald-500 shrink-0">›</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2">
        {p.volumeUsd > 0 && <><span>Vol ${(p.volumeUsd / 1000).toFixed(0)}k</span><span>·</span></>}
        <span>Conf {Math.round(p.confidence * 100)}%</span>
        <span>·</span>
        <span>{daysLabel} left</span>
        {p.analystCount && <><span>·</span><span>{p.analystCount} analysts</span></>}
      </div>
    </div>
  );
}

import type { Prediction } from '@/lib/agents/prediction';

// ─── Edge badge ───────────────────────────────────────────────────────────────

export function EdgeBadge({ edge, side }: { edge: number; side: string }) {
  if (side === 'SKIP') return (
    <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground font-medium">
      No Edge
    </span>
  );
  const pct = Math.round(edge * 100);
  const isHigh = pct >= 20;
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border ${
      isHigh
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isHigh ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
      {side} +{pct}%
    </div>
  );
}

// ─── Probability bar ──────────────────────────────────────────────────────────

export function ProbBar({ label, prob, color, showPct = true }: {
  label: string; prob: number; color: string; showPct?: boolean
}) {
  const pct = Math.round(prob * 100);
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 rounded-full bg-muted/60 h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showPct && <span className="w-8 text-right font-mono tabular-nums text-muted-foreground">{pct}%</span>}
    </div>
  );
}

// ─── Analyst row ──────────────────────────────────────────────────────────────

export function AnalystRow({ analyst }: {
  analyst: { role: string; yourProb: number; confidence: number; headline: string }
}) {
  const pct      = Math.round(analyst.yourProb * 100);
  const conf     = Math.round(analyst.confidence * 100);
  const barColor = conf >= 70 ? 'bg-emerald-500' : conf >= 50 ? 'bg-yellow-500' : 'bg-muted-foreground/50';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{analyst.role}</span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">{pct}% · <span className="text-muted-foreground/70">{conf}% conf</span></span>
      </div>
      <p className="text-xs text-muted-foreground/60 truncate">{analyst.headline}</p>
      <div className="rounded-full bg-muted/40 h-0.5 overflow-hidden">
        <div className={`h-0.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const cfg: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    polymarket: { bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-400',   label: 'Polymarket' },
    kalshi:     { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400', label: 'Kalshi'     },
    metaculus:  { bg: 'bg-teal-500/10',   text: 'text-teal-400',   dot: 'bg-teal-400',   label: 'Metaculus'  },
    custom:     { bg: 'bg-violet-500/10', text: 'text-violet-400', dot: 'bg-violet-400', label: 'Custom'     },
  };
  const c = cfg[source] ?? { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground', label: source };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border border-current/10 ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Main prediction card ─────────────────────────────────────────────────────

export function PredictionCard({ p }: { p: Prediction }) {
  const daysLabel    = p.daysLeft === 1 ? '1 day' : `${p.daysLeft} days`;
  const hasBreakdown = p.analystBreakdown && p.analystBreakdown.length > 0;
  const edgePct      = Math.round(p.edge * 100);
  const confPct      = Math.round(p.confidence * 100);
  const hasEdge      = p.recommendedSide !== 'SKIP';

  return (
    <div className={`group relative rounded-xl border bg-card p-4 space-y-3.5 transition-all duration-200 hover:shadow-lg ${
      p.miroFishEnhanced
        ? 'border-purple-500/25 hover:border-purple-500/40 hover:shadow-purple-500/5'
        : hasEdge
        ? 'border-emerald-500/20 hover:border-emerald-500/35 hover:shadow-emerald-500/5 gradient-border-emerald'
        : 'border-border hover:border-border/80'
    }`}>

      {/* Top glow line for high-edge cards */}
      {hasEdge && edgePct >= 20 && (
        <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-medium leading-snug text-foreground">{p.question}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <SourceBadge source={p.source} />
            {p.miroFishEnhanced && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/15 px-2 py-0.5 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                MiroFish
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 pt-0.5">
          <EdgeBadge edge={p.edge} side={p.recommendedSide} />
        </div>
      </div>

      {/* Probability bars */}
      <div className="space-y-2 py-0.5">
        <ProbBar label="Market"   prob={p.marketProb} color="bg-blue-500/70" />
        <ProbBar label="Ensemble" prob={p.yourProb}   color={hasEdge ? 'bg-emerald-500' : 'bg-muted-foreground/50'} />
        {p.miroFishMeanProb != null && (
          <div className="flex items-center gap-2.5 text-xs">
            <span className="w-16 shrink-0 text-purple-400/80">
              Swarm{p.miroFishAgentCount ? ` ×${p.miroFishAgentCount}` : ''}
            </span>
            <div className="flex-1 rounded-full bg-muted/60 h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-purple-500/80 transition-all duration-700"
                style={{ width: `${Math.round(p.miroFishMeanProb * 100)}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono tabular-nums text-purple-400/80">
              {Math.round(p.miroFishMeanProb * 100)}%
            </span>
            {p.miroFishStdDev != null && (
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                ±{Math.round(p.miroFishStdDev * 100)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Key evidence */}
      {p.keyEvidence?.length > 0 && (
        <ul className="space-y-1.5">
          {p.keyEvidence.slice(0, 2).map((e, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 text-emerald-500/70 shrink-0">›</span>
              <span className="leading-relaxed">{e}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Analyst breakdown */}
      {hasBreakdown && (
        <details className="group/details">
          <summary className="cursor-pointer select-none list-none">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <span className="group-open/details:rotate-90 transition-transform inline-block duration-150">›</span>
              <span>{p.analystCount ?? p.analystBreakdown!.length} analysts</span>
              <span className="text-muted-foreground/40">·</span>
              <span>expand breakdown</span>
            </div>
          </summary>
          <div className="mt-3 space-y-3 border-l-2 border-emerald-500/15 pl-3">
            {p.analystBreakdown!.map((a) => (
              <AnalystRow key={a.role} analyst={a} />
            ))}
          </div>
        </details>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 border-t border-border/50 pt-3">
        {p.volumeUsd > 0 && (
          <><span className="font-medium">${(p.volumeUsd / 1000).toFixed(0)}k vol</span><span className="text-border">·</span></>
        )}
        <span>
          <span className={confPct >= 70 ? 'text-emerald-400/80' : confPct >= 50 ? 'text-yellow-400/80' : ''}>
            {confPct}% conf
          </span>
        </span>
        <span className="text-border">·</span>
        <span>{daysLabel} left</span>
        {p.analystCount && (
          <><span className="text-border">·</span><span>{p.analystCount} analysts</span></>
        )}
      </div>
    </div>
  );
}

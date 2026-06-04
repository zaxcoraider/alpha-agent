'use client';

import { useState, useMemo } from 'react';
import type { MemeToken } from '@/lib/agents/memes';
import {
  ExternalLink, Zap, Users, TrendingUp, TrendingDown, AlertTriangle,
  ChevronDown, ChevronUp, Flame,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemesClientProps {
  tokens: MemeToken[];
}

type Chain = 'all' | 'sol' | 'eth' | 'base' | 'bnb';
type Category = 'all' | 'new_gem' | 'trending' | 'pumped';
type Action = 'all' | 'buy_small' | 'watch' | 'avoid';
type RugFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
type SortKey = 'gem' | 'velocity' | 'mcap' | 'change1h';

// ── Config ────────────────────────────────────────────────────────────────────

const CHAIN_LABELS: Record<string, string> = {
  sol: 'SOL', eth: 'ETH', base: 'BASE', bnb: 'BNB',
};

const CHAIN_COLORS: Record<string, string> = {
  sol:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  eth:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  base: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  bnb:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
};

const RUG_COLORS: Record<string, string> = {
  low:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const ACTION_COLORS: Record<string, string> = {
  buy_small: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  watch:     'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  avoid:     'bg-red-500/20 text-red-300 border-red-500/30',
};

const ACTION_LABELS: Record<string, string> = {
  buy_small: 'Buy Small',
  watch:     'Watch',
  avoid:     'Avoid',
};

const CATEGORY_LABELS: Record<string, string> = {
  new_gem:  'New Gem',
  trending: 'Trending',
  fading:   'Fading',
  pumped:   'Pumped',
};

const CATEGORY_COLORS: Record<string, string> = {
  new_gem:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  trending: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  fading:   'bg-slate-500/15 text-slate-400 border-slate-500/25',
  pumped:   'bg-red-500/15 text-red-300 border-red-500/25',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function Chip({
  label, active, onClick,
}: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-2.5 py-1 rounded-sm text-[11px] font-mono uppercase tracking-wide border transition-colors ${
        active
          ? 'bg-signal/15 text-signal border-signal/40'
          : 'bg-card border-border text-muted-foreground hover:border-signal/30 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function GemBar({ score }: { score: number }) {
  const pct   = Math.min(100, Math.max(0, score));
  const color =
    pct >= 75 ? 'bg-signal' :
    pct >= 55 ? 'bg-risk-medium'  :
    pct >= 35 ? 'bg-risk-high'  :
                'bg-muted-foreground/50';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold tabular-nums ${
        pct >= 75 ? 'text-signal' :
        pct >= 55 ? 'text-risk-medium'  :
        pct >= 35 ? 'text-risk-high'  : 'text-muted-foreground'
      }`}>{score}</span>
    </div>
  );
}

// ── Score breakdown mini-bars ─────────────────────────────────────────────────

function ScoreBreakdown({ token }: { token: MemeToken }) {
  const bars = [
    { label: 'Narrative', score: token.narrativeScore, max: 25 },
    { label: 'KOL',       score: token.kolScore,       max: 25 },
    { label: 'Safety',    score: token.safetyScore,    max: 25 },
    { label: 'Volume',    score: token.volumeScore,    max: 25 },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {bars.map((b) => {
        const pct   = Math.round((b.score / b.max) * 100);
        const color =
          pct >= 80 ? 'bg-signal' :
          pct >= 50 ? 'bg-risk-medium'  :
                      'bg-muted-foreground/50';
        return (
          <div key={b.label}>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>{b.label}</span>
              <span>{b.score}/{b.max}</span>
            </div>
            <div className="h-1 rounded-full bg-white/10">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Token card ────────────────────────────────────────────────────────────────

function TokenCard({ token }: { token: MemeToken }) {
  const [expanded, setExpanded] = useState(false);
  const up1h = (token.priceChange1h ?? 0) >= 0;

  return (
    <div className={`hud-panel rounded-lg p-4 flex flex-col gap-3 transition-colors ${
      token.gemScore >= 75 ? 'border-signal/40' :
      token.watchAction === 'avoid' ? 'border-risk-critical/30' : ''
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <span className="font-bold text-sm">${token.ticker}</span>
          <span className="ml-1.5 text-xs text-muted-foreground truncate">{token.name}</span>
        </div>

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
          CHAIN_COLORS[token.chain] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
        }`}>
          {CHAIN_LABELS[token.chain] ?? token.chain.toUpperCase()}
        </span>

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[token.category]}`}>
          {CATEGORY_LABELS[token.category]}
        </span>

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ACTION_COLORS[token.watchAction]}`}>
          {ACTION_LABELS[token.watchAction]}
        </span>
      </div>

      {/* Gem score */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1 flex justify-between">
          <span>Gem Score</span>
          <span className={`px-1.5 py-0.5 rounded border ${RUG_COLORS[token.rugRisk]}`}>
            Rug: {token.rugRisk.toUpperCase()}
          </span>
        </div>
        <GemBar score={token.gemScore} />
      </div>

      {/* Price stats */}
      <div className="flex flex-wrap gap-3 text-xs">
        {token.marketCapUsd !== undefined && (
          <span className="text-muted-foreground">
            MCap: <span className="text-foreground font-medium">{fmt(token.marketCapUsd)}</span>
          </span>
        )}

        {token.priceChange1h !== undefined && (
          <span className={`flex items-center gap-0.5 font-medium ${up1h ? 'text-emerald-400' : 'text-red-400'}`}>
            {up1h ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up1h ? '+' : ''}{token.priceChange1h.toFixed(1)}% 1h
          </span>
        )}

        {token.volumeUsd24h !== undefined && (
          <span className="text-muted-foreground">
            Vol: <span className="text-foreground font-medium">{fmt(token.volumeUsd24h)}</span>
          </span>
        )}

        {token.deployedHoursAgo !== undefined && token.deployedHoursAgo < 72 && (
          <span className="text-orange-300 font-medium">
            {token.deployedHoursAgo < 1 ? '<1h' : `${Math.round(token.deployedHoursAgo)}h`} old
          </span>
        )}
      </div>

      {/* CT signals */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-yellow-400" />
          {token.ctMentions} CT · {token.ctVelocity.toFixed(1)}/hr
        </span>

        {token.mentionedByKOL && (
          <span className="flex items-center gap-1 text-sky-300">
            <Users className="h-3 w-3" />
            KOL{token.kolHandles.length > 0 ? ` (${token.kolHandles.slice(0, 2).join(', ')})` : ''}
          </span>
        )}

        <span className="text-muted-foreground">
          {token.narrative}
        </span>
      </div>

      {/* Watch reason */}
      <p className="text-xs text-muted-foreground leading-relaxed">{token.watchReason}</p>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide details' : 'Score breakdown'}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
          <ScoreBreakdown token={token} />
          <p className="text-xs text-muted-foreground leading-relaxed">{token.gemBreakdown}</p>
          {token.rugFlags.length > 0 && (
            <div className="flex items-start gap-1 text-risk-high text-xs">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{token.rugFlags.join(' · ')}</span>
            </div>
          )}
          {token.priceTarget && (
            <p className="text-xs text-signal">🎯 {token.priceTarget}</p>
          )}
        </div>
      )}

      {/* DEX link */}
      {token.dexUrl && (
        <a href={token.dexUrl} target="_blank" rel="noopener noreferrer" className="mt-auto">
          <button className={`w-full flex items-center justify-center gap-1.5 rounded-lg text-xs h-8 font-medium font-mono uppercase tracking-wide border transition-colors ${
            token.watchAction === 'avoid'
              ? 'bg-muted text-muted-foreground border-border hover:bg-accent'
              : 'bg-signal/15 text-signal border-signal/40 hover:bg-signal/25'
          }`}>
            <ExternalLink className="h-3 w-3" />
            View on DexScreener
          </button>
        </a>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MemesClient({ tokens }: MemesClientProps) {
  const [chain, setChain]       = useState<Chain>('all');
  const [category, setCategory] = useState<Category>('all');
  const [action, setAction]     = useState<Action>('all');
  const [rug, setRug]           = useState<RugFilter>('all');
  const [minGem, setMinGem]     = useState(0);
  const [sort, setSort]         = useState<SortKey>('gem');

  const hotGems = tokens.filter((t) => t.gemScore >= 75 && t.watchAction !== 'avoid');

  const filtered = useMemo(() => {
    let r = tokens;
    if (chain !== 'all')    r = r.filter((t) => t.chain === chain);
    if (category !== 'all') r = r.filter((t) => t.category === category);
    if (action !== 'all')   r = r.filter((t) => t.watchAction === action);
    if (rug !== 'all')      r = r.filter((t) => t.rugRisk === rug);
    if (minGem > 0)         r = r.filter((t) => t.gemScore >= minGem);

    return [...r].sort((a, b) => {
      if (sort === 'gem')      return b.gemScore - a.gemScore;
      if (sort === 'velocity') return b.ctVelocity - a.ctVelocity;
      if (sort === 'mcap')     return (a.marketCapUsd ?? 0) - (b.marketCapUsd ?? 0);
      if (sort === 'change1h') return (b.priceChange1h ?? 0) - (a.priceChange1h ?? 0);
      return 0;
    });
  }, [tokens, chain, category, action, rug, minGem, sort]);

  const chains: Chain[]   = ['all', 'sol', 'eth', 'base', 'bnb'];
  const cats: Category[]  = ['all', 'new_gem', 'trending', 'pumped'];
  const actions: Action[] = ['all', 'buy_small', 'watch', 'avoid'];
  const rugs: RugFilter[] = ['all', 'low', 'medium', 'high', 'critical'];
  const sorts: { key: SortKey; label: string }[] = [
    { key: 'gem',      label: 'Gem Score'  },
    { key: 'velocity', label: 'CT Velocity'},
    { key: 'mcap',     label: 'Lowest MCap'},
    { key: 'change1h', label: '1h Change'  },
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* Hot gems banner */}
      {hotGems.length > 0 && (
        <div className="hud-panel rounded-lg border-risk-high/40 p-4">
          <div className="flex items-center gap-2 text-risk-high font-semibold text-sm mb-2 font-mono uppercase tracking-wide">
            <Flame className="h-4 w-4" />
            {hotGems.length} Hot Gem{hotGems.length > 1 ? 's' : ''} Detected
          </div>
          <div className="flex flex-wrap gap-2">
            {hotGems.map((t) => (
              <span
                key={t.contractAddress ?? `${t.ticker}-${t.chain}`}
                className="text-[11px] font-mono px-2 py-0.5 rounded-sm bg-risk-high/15 text-risk-high border border-risk-high/30"
              >
                ${t.ticker} ({CHAIN_LABELS[t.chain]}) · {t.gemScore}/100
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex overflow-x-auto gap-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          {chains.map((c) => (
            <Chip key={c} label={c === 'all' ? 'All Chains' : CHAIN_LABELS[c] ?? c.toUpperCase()}
              active={chain === c} color="emerald" onClick={() => setChain(c)} />
          ))}
          <span className="w-px bg-border shrink-0 mx-0.5" />
          {cats.map((c) => (
            <Chip key={c}
              label={c === 'all' ? 'All Types' : CATEGORY_LABELS[c]}
              active={category === c} color="sky" onClick={() => setCategory(c)} />
          ))}
        </div>
        <div className="flex overflow-x-auto gap-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          {actions.map((a) => (
            <Chip key={a}
              label={a === 'all' ? 'All Actions' : ACTION_LABELS[a]}
              active={action === a} color="violet" onClick={() => setAction(a)} />
          ))}
          <span className="w-px bg-border shrink-0 mx-0.5" />
          {rugs.map((r) => (
            <Chip key={r}
              label={r === 'all' ? 'All Risk' : r.charAt(0).toUpperCase() + r.slice(1)}
              active={rug === r} color="orange" onClick={() => setRug(r)} />
          ))}
          <span className="w-px bg-border shrink-0 mx-0.5" />
          {sorts.map((s) => (
            <Chip key={s.key} label={s.label} active={sort === s.key} color="rose"
              onClick={() => setSort(s.key)} />
          ))}
        </div>
      </div>

      {/* Min gem slider */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground whitespace-nowrap w-28">
          Min Gem: {minGem}
        </span>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={minGem}
          onChange={(e) => setMinGem(Number(e.target.value))}
          className="max-w-xs accent-emerald-500"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {tokens.length} tokens
      </p>

      {filtered.length === 0 ? (
        <div className="hud-panel rounded-lg p-12 text-center text-muted-foreground text-sm">
          No tokens match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TokenCard key={t.contractAddress ?? `${t.ticker}-${t.chain}`} token={t} />
          ))}
        </div>
      )}
    </div>
  );
}

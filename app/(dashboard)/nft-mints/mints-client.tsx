'use client';

import { useState, useMemo } from 'react';
import type { NFTMint } from '@/lib/agents/nft-mints';
import { ExternalLink, Zap, Users, Fish, AlertTriangle, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MintsClientProps {
  mints: NFTMint[];
}

type Chain = 'all' | 'sol' | 'eth' | 'base' | 'arbitrum' | 'polygon' | 'bnb';
type RugFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
type StatusFilter = 'all' | 'not_started' | 'live' | 'ending_soon';
type SortKey = 'alpha' | 'velocity' | 'free';

// ── Config ────────────────────────────────────────────────────────────────────

const CHAIN_LABELS: Record<string, string> = {
  sol: 'SOL', eth: 'ETH', base: 'BASE', arbitrum: 'ARB', polygon: 'MATIC', bnb: 'BNB',
};

const CHAIN_COLORS: Record<string, string> = {
  sol:      'bg-purple-500/20 text-purple-300 border-purple-500/30',
  eth:      'bg-blue-500/20 text-blue-300 border-blue-500/30',
  base:     'bg-sky-500/20 text-sky-300 border-sky-500/30',
  arbitrum: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  polygon:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  bnb:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
};

const RUG_COLORS: Record<string, string> = {
  low:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  live:        'LIVE',
  ending_soon: 'Ending Soon',
  sold_out:    'Sold Out',
};

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  live:        'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  ending_soon: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  sold_out:    'bg-slate-700/20 text-slate-500 border-slate-700/30',
};

// ── Chip helper ───────────────────────────────────────────────────────────────

function Chip({
  label, active, onClick,
}: {
  label: string;
  active: boolean;
  color?: 'emerald' | 'sky' | 'orange' | 'violet';
  onClick: () => void;
}) {
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

// ── Alpha score bar ───────────────────────────────────────────────────────────

function AlphaBar({ score }: { score: number }) {
  const pct   = Math.min(100, Math.max(0, score));
  const color =
    pct >= 80 ? 'bg-signal' :
    pct >= 60 ? 'bg-risk-medium'  :
    pct >= 40 ? 'bg-risk-high'  :
                'bg-muted-foreground/50';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold tabular-nums ${
        pct >= 80 ? 'text-signal' :
        pct >= 60 ? 'text-risk-medium'  :
        pct >= 40 ? 'text-risk-high'  : 'text-muted-foreground'
      }`}>{score}</span>
    </div>
  );
}

// ── NFT card ──────────────────────────────────────────────────────────────────

function MintCard({ mint }: { mint: NFTMint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`relative hud-panel rounded-lg p-4 flex flex-col gap-3 transition-colors ${
      mint.alphaScore >= 80 ? 'border-signal/40' : ''
    }`}>
      {/* Name + badges */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className="font-semibold text-sm flex-1 min-w-0 truncate">{mint.name}</span>

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
          CHAIN_COLORS[mint.chain] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
        }`}>
          {CHAIN_LABELS[mint.chain] ?? mint.chain.toUpperCase()}
        </span>

        {mint.mintPrice === 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            FREE
          </span>
        )}

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_COLORS[mint.mintStatus]}`}>
          {STATUS_LABELS[mint.mintStatus]}
        </span>
      </div>

      {/* Alpha score + rug risk */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>Alpha Score</span>
          <span className={`font-semibold px-1.5 py-0.5 rounded border ${RUG_COLORS[mint.rugRisk]}`}>
            Rug: {mint.rugRisk.toUpperCase()}
          </span>
        </div>
        <AlphaBar score={mint.alphaScore} />
      </div>

      {/* Signals row */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-yellow-400" />
          {mint.ctMentions} CT · {mint.ctVelocity.toFixed(1)}/hr
        </span>

        {mint.mentionedByKOL && (
          <span className="flex items-center gap-1 text-sky-300">
            <Users className="h-3 w-3" />
            KOL{mint.kolHandles.length > 0 ? ` (${mint.kolHandles.slice(0, 2).join(', ')})` : ''}
          </span>
        )}

        {mint.whaleActivity && (
          <span className="flex items-center gap-1 text-purple-300">
            <Fish className="h-3 w-3" />
            Whale in
          </span>
        )}

        {mint.mintPrice > 0 && (
          <span className="text-slate-300">{mint.mintPrice} {mint.mintPriceCurrency}</span>
        )}

        {mint.supply && (
          <span>Supply: {mint.supply.toLocaleString()}</span>
        )}

        {mint.gasEstimate && (
          <span>⛽ {mint.gasEstimate}</span>
        )}
      </div>

      {/* Potential + floor */}
      <div className="flex items-center flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-emerald-400" />
          Potential: <span className="font-semibold text-foreground ml-1">{mint.futurePotential}/10</span>
        </span>
        {mint.floorPrediction7d && (
          <span className="text-muted-foreground">
            7d floor: <span className="font-semibold text-sky-300">{mint.floorPrediction7d}</span>
          </span>
        )}
        {mint.similarTo && (
          <span className="text-muted-foreground">≈ {mint.similarTo}</span>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide breakdown' : 'Alpha breakdown'}
      </button>

      {expanded && (
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
          <p className="mb-2">{mint.alphaBreakdown}</p>
          {mint.rugFlags.length > 0 && (
            <div className="flex items-start gap-1 text-risk-high">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>Flags: {mint.rugFlags.join(' · ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Mint link */}
      {mint.mintLink && (
        <a href={mint.mintLink} target="_blank" rel="noopener noreferrer" className="mt-auto">
          <button className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-signal/15 text-signal border border-signal/40 hover:bg-signal/25 text-xs h-8 font-medium font-mono uppercase tracking-wide transition-colors">
            <ExternalLink className="h-3 w-3" />
            Mint Now
          </button>
        </a>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MintsClient({ mints }: MintsClientProps) {
  const [chain, setChain]       = useState<Chain>('all');
  const [freeOnly, setFreeOnly] = useState(false);
  const [rug, setRug]           = useState<RugFilter>('all');
  const [status, setStatus]     = useState<StatusFilter>('all');
  const [minAlpha, setMinAlpha] = useState(0);
  const [sort, setSort]         = useState<SortKey>('alpha');

  const highAlpha = mints.filter((m) => m.alphaScore >= 80);

  const filtered = useMemo(() => {
    let r = mints;
    if (chain !== 'all')  r = r.filter((m) => m.chain === chain);
    if (freeOnly)         r = r.filter((m) => m.mintPrice === 0);
    if (rug !== 'all')    r = r.filter((m) => m.rugRisk === rug);
    if (status !== 'all') r = r.filter((m) => m.mintStatus === status);
    if (minAlpha > 0)     r = r.filter((m) => m.alphaScore >= minAlpha);

    return [...r].sort((a, b) => {
      if (sort === 'alpha')    return b.alphaScore - a.alphaScore;
      if (sort === 'velocity') return b.ctVelocity - a.ctVelocity;
      if (sort === 'free')     return (a.mintPrice === 0 ? 0 : 1) - (b.mintPrice === 0 ? 0 : 1);
      return 0;
    });
  }, [mints, chain, freeOnly, rug, status, minAlpha, sort]);

  const chains: Chain[]                                 = ['all', 'sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb'];
  const rugOptions: RugFilter[]                         = ['all', 'low', 'medium', 'high', 'critical'];
  const statusOptions: StatusFilter[]                   = ['all', 'not_started', 'live', 'ending_soon'];
  const sortOptions: { key: SortKey; label: string }[]  = [
    { key: 'alpha',    label: 'Alpha Score' },
    { key: 'velocity', label: 'CT Velocity' },
    { key: 'free',     label: 'Free First'  },
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* High-alpha alert banner */}
      {highAlpha.length > 0 && (
        <div className="hud-panel rounded-lg border-signal/40 p-4">
          <div className="flex items-center gap-2 text-signal font-semibold text-sm mb-2 font-mono uppercase tracking-wide">
            <Zap className="h-4 w-4" />
            {highAlpha.length} High-Alpha Mint{highAlpha.length > 1 ? 's' : ''} Detected
          </div>
          <div className="flex flex-wrap gap-2">
            {highAlpha.map((m) => (
              <span
                key={m.contractAddress ?? m.name}
                className="text-[11px] font-mono px-2 py-0.5 rounded-sm bg-signal/15 text-signal border border-signal/30"
              >
                {m.name} · {m.alphaScore}/100{m.mintPrice === 0 ? ' · FREE' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex overflow-x-auto gap-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          {chains.map((c) => (
            <Chip
              key={c} label={c === 'all' ? 'All Chains' : CHAIN_LABELS[c] ?? c.toUpperCase()}
              active={chain === c} color="emerald" onClick={() => setChain(c)}
            />
          ))}
          <span className="w-px bg-border shrink-0 mx-0.5" />
          <Chip label="🆓 Free Only" active={freeOnly} color="emerald" onClick={() => setFreeOnly((p) => !p)} />
        </div>
        <div className="flex overflow-x-auto gap-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          {statusOptions.map((s) => (
            <Chip
              key={s} label={s === 'all' ? 'All Status' : STATUS_LABELS[s] ?? s}
              active={status === s} color="sky" onClick={() => setStatus(s)}
            />
          ))}
          <span className="w-px bg-border shrink-0 mx-0.5" />
          {rugOptions.map((r) => (
            <Chip
              key={r} label={r === 'all' ? 'All Risk' : r.charAt(0).toUpperCase() + r.slice(1)}
              active={rug === r} color="orange" onClick={() => setRug(r)}
            />
          ))}
          <span className="w-px bg-border shrink-0 mx-0.5" />
          {sortOptions.map((s) => (
            <Chip key={s.key} label={s.label} active={sort === s.key} color="violet" onClick={() => setSort(s.key)} />
          ))}
        </div>
      </div>

      {/* Min alpha slider */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground whitespace-nowrap w-28">
          Min Alpha: {minAlpha}
        </span>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={minAlpha}
          onChange={(e) => setMinAlpha(Number(e.target.value))}
          className="max-w-xs accent-emerald-500"
        />
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {mints.length} projects
      </p>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="hud-panel rounded-lg p-12 text-center text-muted-foreground text-sm">
          No mints match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <MintCard key={m.contractAddress ?? m.name} mint={m} />
          ))}
        </div>
      )}
    </div>
  );
}

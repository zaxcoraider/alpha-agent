'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Clock, Trophy, MapPin, Wifi, ChevronDown, Check, Calendar } from 'lucide-react';
import type { ProcessedOpportunity } from '@/lib/agents/dev-events';
import { cn } from '@/lib/utils/cn';

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  hackathon:   { label: 'Hackathon',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
  grant:       { label: 'Grant',        color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/25' },
  bounty:      { label: 'Bounty',       color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/25' },
  audit:       { label: 'Audit',        color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/25' },
  accelerator: { label: 'Accelerator',  color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/25' },
  bug_bounty:  { label: 'Bug Bounty',   color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/25' },
  prize:       { label: 'Prize',        color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/25' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  closing_soon: { label: 'Closing Soon', color: 'text-red-400' },
  active:       { label: 'Active',       color: 'text-emerald-400' },
  upcoming:     { label: 'Upcoming',     color: 'text-blue-400' },
  ended:        { label: 'Ended',        color: 'text-muted-foreground' },
};

const TRACKER_STATES = ['interested', 'applied', 'building', 'submitted', 'won', 'passed'] as const;
type TrackerState = (typeof TRACKER_STATES)[number];

const TRACKER_CONFIG: Record<TrackerState, { label: string; color: string }> = {
  interested: { label: 'Interested',  color: 'text-blue-400' },
  applied:    { label: 'Applied',     color: 'text-emerald-400' },
  building:   { label: 'Building',    color: 'text-yellow-400' },
  submitted:  { label: 'Submitted',   color: 'text-purple-400' },
  won:        { label: 'Won 🏆',      color: 'text-yellow-300' },
  passed:     { label: 'Passed',      color: 'text-muted-foreground' },
};

const LS_KEY = 'alpha_dev_tracker_v1';

// ── Tracker hook ──────────────────────────────────────────────────────────────

function useTracker() {
  const [state, setState] = useState<Record<string, TrackerState>>({});

  useEffect(() => {
    try {
      setState(JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'));
    } catch { /* ignore */ }
  }, []);

  function set(id: string, status: TrackerState | null) {
    setState((prev) => {
      const next = { ...prev };
      if (status === null) delete next[id]; else next[id] = status;
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return { state, set };
}

// ── Tracker button ────────────────────────────────────────────────────────────

function TrackerButton({ id, state, set }: {
  id: string;
  state: Record<string, TrackerState>;
  set: (id: string, s: TrackerState | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = state[id];
  const cfg     = current ? TRACKER_CONFIG[current] : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
          cfg
            ? `border-current/20 bg-current/10 ${cfg.color}`
            : 'border-border bg-card text-muted-foreground hover:bg-accent',
        )}
      >
        {cfg ? cfg.label : 'Track'}
        <ChevronDown size={10} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden w-36">
          {TRACKER_STATES.map((s) => (
            <button
              key={s}
              onClick={() => { set(id, s); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span className={TRACKER_CONFIG[s].color}>{TRACKER_CONFIG[s].label}</span>
              {current === s && <Check size={10} className="text-emerald-400" />}
            </button>
          ))}
          {current && (
            <button
              onClick={() => { set(id, null); setOpen(false); }}
              className="w-full px-3 py-2 text-xs text-muted-foreground/50 hover:bg-accent text-left transition-colors border-t border-border/50"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Opportunity card ──────────────────────────────────────────────────────────

function OpportunityCard({
  opp,
  trackerId,
  tracker,
}: {
  opp: ProcessedOpportunity;
  trackerId: string;
  tracker: ReturnType<typeof useTracker>;
}) {
  const typeCfg   = TYPE_CONFIG[opp.type]   ?? { label: opp.type,   color: 'text-muted-foreground', bg: 'bg-muted/20 border-border' };
  const statusCfg = STATUS_CONFIG[opp.status] ?? { label: opp.status, color: 'text-muted-foreground' };

  const scoreColor =
    opp.matchScore >= 8 ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
    opp.matchScore >= 6 ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' :
    'text-muted-foreground bg-muted/30 border-border';

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all hover:border-border/80',
      opp.status === 'closing_soon' && 'border-red-500/30',
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', typeCfg.bg, typeCfg.color)}>
            {typeCfg.label}
          </span>
          <span className={cn('text-[10px] font-medium', statusCfg.color)}>
            {statusCfg.label}
          </span>
        </div>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0', scoreColor)}>
          {opp.matchScore}/10
        </span>
      </div>

      {/* Title + prize */}
      <div>
        <h3 className="text-sm font-semibold text-foreground leading-snug">{opp.title}</h3>
        {opp.prizeTotal && (
          <div className="flex items-center gap-1.5 mt-1">
            <Trophy size={11} className="text-yellow-400 shrink-0" />
            <span className="text-sm font-bold text-yellow-400">{opp.prizeTotal}</span>
            {opp.prizeBreakdown && (
              <span className="text-[10px] text-muted-foreground truncate">{opp.prizeBreakdown}</span>
            )}
          </div>
        )}
      </div>

      {/* Deadline */}
      {opp.deadline && (
        <div className={cn('flex items-center gap-1.5', opp.status === 'closing_soon' ? 'text-red-400' : 'text-muted-foreground')}>
          <Clock size={11} className="shrink-0" />
          <span className="text-xs">
            {opp.daysLeft !== undefined && opp.daysLeft !== null
              ? opp.daysLeft === 0
                ? 'Closes today'
                : `${opp.daysLeft} days left`
              : ''
            }
            {opp.deadline && ` · ${opp.deadline}`}
          </span>
        </div>
      )}

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{opp.description}</p>

      {/* Match reason */}
      <p className="text-xs text-emerald-400/80 leading-relaxed">{opp.matchReason}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {opp.chains.slice(0, 4).map((c) => (
          <span key={c} className="rounded px-1.5 py-0.5 text-[10px] bg-muted/40 text-muted-foreground font-mono">{c}</span>
        ))}
        {opp.skills.slice(0, 4).map((s) => (
          <span key={s} className="rounded px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary/70">{s}</span>
        ))}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
        {opp.remote && <span className="flex items-center gap-1"><Wifi size={10} />Remote</span>}
        {opp.location && !opp.remote && <span className="flex items-center gap-1"><MapPin size={10} />{opp.location}</span>}
        {opp.sponsors.length > 0 && <span className="truncate">by {opp.sponsors.slice(0, 2).join(', ')}</span>}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <TrackerButton id={trackerId} state={tracker.state} set={tracker.set} />
        {opp.sourceUrl && (
          <a
            href={opp.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            Apply <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

type SortKey = 'score' | 'deadline' | 'prize';

const TYPE_FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'hackathon',   label: 'Hackathon' },
  { key: 'grant',       label: 'Grant' },
  { key: 'bounty',      label: 'Bounty' },
  { key: 'audit',       label: 'Audit' },
  { key: 'accelerator', label: 'Accelerator' },
  { key: 'bug_bounty',  label: 'Bug Bounty' },
  { key: 'prize',       label: 'Prize' },
];

export function EventsClient({ opportunities }: { opportunities: ProcessedOpportunity[] }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy,     setSortBy]     = useState<SortKey>('score');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [minScore,   setMinScore]   = useState(1);
  const [viewMode,   setViewMode]   = useState<'grid' | 'calendar'>('grid');
  const tracker = useTracker();

  const filtered = opportunities
    .filter((o) => typeFilter === 'all' || o.type === typeFilter)
    .filter((o) => !remoteOnly || o.remote)
    .filter((o) => o.matchScore >= minScore)
    .sort((a, b) => {
      if (sortBy === 'score')    return b.matchScore - a.matchScore;
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      }
      return 0; // prize sort — keep score order as fallback
    });

  const closingSoon = opportunities.filter((o) => o.status === 'closing_soon');
  const highMatch   = opportunities.filter((o) => o.matchScore >= 8).length;
  const totalPrize  = opportunities.filter((o) => o.prizeTotal).length;

  // Calendar: group by deadline month
  const byMonth: Record<string, ProcessedOpportunity[]> = {};
  for (const o of opportunities) {
    if (!o.deadline) continue;
    const month = o.deadline.slice(0, 7); // YYYY-MM
    (byMonth[month] ??= []).push(o);
  }

  return (
    <div className="space-y-4">
      {/* Closing soon banner */}
      {closingSoon.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
          <Clock size={14} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-semibold text-red-400">
              {closingSoon.length} deadline{closingSoon.length > 1 ? 's' : ''} in ≤3 days —
            </span>
            <span className="text-xs text-red-300/80 ml-1">
              {closingSoon.map((o) => o.title).join(' · ')}
            </span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <p className="text-xl font-bold">{opportunities.length}</p>
          <p className="text-xs text-muted-foreground">Opportunities</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{highMatch}</p>
          <p className="text-xs text-muted-foreground">Score ≥ 8 match</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <p className="text-xl font-bold text-yellow-400">{totalPrize}</p>
          <p className="text-xs text-muted-foreground">With prizes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Type chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                typeFilter === key
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 border border-transparent',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500/40"
          >
            <option value="score">Sort: Match Score</option>
            <option value="deadline">Sort: Deadline</option>
          </select>

          {/* Min score */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Min score:</span>
            <input
              type="range" min={1} max={10} step={1} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-24 accent-emerald-500"
            />
            <span className="font-mono text-foreground w-4">{minScore}</span>
          </div>

          {/* Remote toggle */}
          <button
            onClick={() => setRemoteOnly((r) => !r)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all',
              remoteOnly
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            <Wifi size={11} /> Remote only
          </button>

          <div className="flex-1" />

          {/* View mode */}
          <div className="flex rounded-lg border border-border bg-muted/20 p-0.5 gap-0.5">
            {(['grid', 'calendar'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-all',
                  viewMode === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'grid' ? 'Grid' : <span className="flex items-center gap-1"><Calendar size={11} />Calendar</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {opportunities.length} opportunities
      </p>

      {viewMode === 'grid' ? (
        /* Grid view */
        filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No opportunities match the current filters.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((opp, i) => {
              const tid = `${opp.title}-${opp.deadline ?? i}`;
              return (
                <OpportunityCard
                  key={tid}
                  opp={opp}
                  trackerId={tid}
                  tracker={tracker}
                />
              );
            })}
          </div>
        )
      ) : (
        /* Calendar / deadline timeline view */
        <div className="space-y-6">
          {Object.keys(byMonth).sort().map((month) => {
            const [year, m] = month.split('-');
            const label = new Date(`${year}-${m}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            const items = byMonth[month].sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
            return (
              <div key={month}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Calendar size={13} />{label}
                  <span className="text-xs font-normal">({items.length})</span>
                </h3>
                <div className="space-y-2">
                  {items.map((opp, i) => {
                    const typeCfg = TYPE_CONFIG[opp.type] ?? { label: opp.type, color: 'text-muted-foreground', bg: '' };
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                        <div className="shrink-0 text-center w-10">
                          <p className="text-sm font-bold text-foreground">{opp.deadline?.slice(8, 10)}</p>
                          <p className="text-[9px] text-muted-foreground uppercase">{new Date(`${opp.deadline}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</p>
                        </div>
                        <div className="w-px h-8 bg-border shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-[10px] font-semibold', typeCfg.color)}>{typeCfg.label}</span>
                            {opp.status === 'closing_soon' && <span className="text-[10px] text-red-400">· Closing soon</span>}
                          </div>
                          <p className="text-xs font-medium truncate">{opp.title}</p>
                        </div>
                        {opp.prizeTotal && (
                          <span className="text-xs font-bold text-yellow-400 shrink-0">{opp.prizeTotal}</span>
                        )}
                        <span className={cn('text-xs font-bold shrink-0', opp.matchScore >= 8 ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {opp.matchScore}/10
                        </span>
                        {opp.sourceUrl && (
                          <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {Object.keys(byMonth).length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">No deadlines found in scan results.</p>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import type { XEvent } from '@/lib/agents/x-events';
import {
  Mic, Flame, Eye, Gift, Unlock, TrendingUp,
  ExternalLink, Users, ChevronDown, ChevronUp, Zap, ArrowUpRight, ArrowDownRight,
  Globe, Activity,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface XEventsClientProps {
  events: XEvent[];
}

type TypeFilter = 'all' | XEvent['type'];
type UrgencyFilter = 'all' | XEvent['urgency'];
type ImpactFilter = 'all' | XEvent['priceImpact'];
type SortKey = 'urgency' | 'relevance' | 'engagement';

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<XEvent['type'], { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  space:            { label: 'Space',           color: 'text-purple-300',  bg: 'bg-purple-500/15 border-purple-500/30',  Icon: Mic        },
  viral_thread:     { label: 'Viral Thread',    color: 'text-orange-300',  bg: 'bg-orange-500/15 border-orange-500/30',  Icon: Flame      },
  kol_alert:        { label: 'KOL Alert',       color: 'text-sky-300',     bg: 'bg-sky-500/15 border-sky-500/30',        Icon: Eye        },
  airdrop:          { label: 'Airdrop',         color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30',Icon: Gift       },
  token_unlock:     { label: 'Unlock',          color: 'text-yellow-300',  bg: 'bg-yellow-500/15 border-yellow-500/30',  Icon: Unlock     },
  listing:          { label: 'Listing',         color: 'text-cyan-300',    bg: 'bg-cyan-500/15 border-cyan-500/30',      Icon: TrendingUp },
  narrative_shift:  { label: 'Narrative',       color: 'text-violet-300',  bg: 'bg-violet-500/15 border-violet-500/30',  Icon: Globe      },
  whale_move:       { label: 'Whale Move',      color: 'text-blue-300',    bg: 'bg-blue-500/15 border-blue-500/30',      Icon: Activity   },
};

const URGENCY_CONFIG: Record<XEvent['urgency'], { label: string; color: string; dot: string }> = {
  live:      { label: 'Live Now',   color: 'text-red-400',     dot: 'bg-red-400 animate-pulse' },
  today:     { label: 'Today',      color: 'text-orange-400',  dot: 'bg-orange-400'            },
  this_week: { label: 'This Week',  color: 'text-yellow-400',  dot: 'bg-yellow-400'            },
  upcoming:  { label: 'Upcoming',   color: 'text-slate-400',   dot: 'bg-slate-500'             },
};

const IMPACT_CONFIG: Record<XEvent['priceImpact'], { label: string; color: string }> = {
  bullish: { label: '↑ Bullish', color: 'text-emerald-400' },
  bearish: { label: '↓ Bearish', color: 'text-red-400'     },
  neutral: { label: '→ Neutral', color: 'text-slate-400'   },
  unknown: { label: '? Unknown', color: 'text-slate-500'   },
};

// ── Chip helper ───────────────────────────────────────────────────────────────

function Chip({
  label, active, color = 'emerald', onClick,
}: { label: string; active: boolean; color?: string; onClick: () => void }) {
  const activeCls: Record<string, string> = {
    emerald: 'bg-emerald-600 border-emerald-500 text-white',
    sky:     'bg-sky-600 border-sky-500 text-white',
    orange:  'bg-orange-600 border-orange-500 text-white',
    violet:  'bg-violet-600 border-violet-500 text-white',
    rose:    'bg-rose-600 border-rose-500 text-white',
  };
  const hoverCls: Record<string, string> = {
    emerald: 'hover:border-emerald-500/50',
    sky:     'hover:border-sky-500/40',
    orange:  'hover:border-orange-500/40',
    violet:  'hover:border-violet-500/40',
    rose:    'hover:border-rose-500/40',
  };
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? (activeCls[color] ?? activeCls.emerald)
          : `bg-card border-border text-muted-foreground ${hoverCls[color] ?? hoverCls.emerald}`
      }`}
    >
      {label}
    </button>
  );
}

// ── Score dots ────────────────────────────────────────────────────────────────

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < score
              ? score >= 8 ? 'bg-emerald-400' : score >= 5 ? 'bg-yellow-400' : 'bg-slate-500'
              : 'bg-white/10'
          }`}
        />
      ))}
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: XEvent }) {
  const [expanded, setExpanded] = useState(false);
  const cfg     = TYPE_CONFIG[event.type];
  const urgency = URGENCY_CONFIG[event.urgency];
  const impact  = IMPACT_CONFIG[event.priceImpact];
  const { Icon } = cfg;

  return (
    <div className={`rounded-xl border bg-card p-4 flex flex-col gap-3 transition-colors ${
      event.urgency === 'live' && event.relevanceScore >= 7
        ? 'border-red-500/40 bg-red-950/10'
        : event.relevanceScore >= 8
        ? 'border-emerald-500/30'
        : 'border-border'
    }`}>
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${cfg.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>

            {/* Urgency dot + label */}
            <span className={`flex items-center gap-1 text-[10px] font-medium ${urgency.color}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
              {urgency.label}
            </span>

            {event.ticker && (
              <span className="text-[10px] font-mono font-bold text-slate-300 bg-white/5 px-1.5 py-0.5 rounded">
                ${event.ticker}
              </span>
            )}

            {/* Price impact */}
            <span className={`text-[10px] font-medium ${impact.color} ml-auto`}>
              {impact.label}
            </span>
          </div>

          <p className="text-sm font-semibold leading-snug">{event.title}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {event.kolHandle && (
          <span className="flex items-center gap-1 text-sky-300">
            <Users className="h-3 w-3" />
            @{event.kolHandle}
            {event.followersCount ? (
              <span className="text-muted-foreground">
                ({event.followersCount >= 1_000_000
                  ? `${(event.followersCount / 1_000_000).toFixed(1)}M`
                  : `${(event.followersCount / 1_000).toFixed(0)}K`})
              </span>
            ) : null}
          </span>
        )}

        {event.engagementCount !== undefined && event.engagementCount > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Zap className="h-3 w-3 text-orange-400" />
            {event.engagementCount.toLocaleString()} engagements
          </span>
        )}

        {event.scheduledFor && (
          <span className="text-muted-foreground">
            📅 {new Date(event.scheduledFor).toLocaleString(undefined, {
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* Relevance score */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-16">Relevance</span>
        <ScoreDots score={event.relevanceScore} />
        <span className={`text-[10px] font-bold ml-1 ${
          event.relevanceScore >= 8 ? 'text-emerald-400' :
          event.relevanceScore >= 5 ? 'text-yellow-400'  : 'text-slate-500'
        }`}>{event.relevanceScore}/10</span>
      </div>

      {/* Actionable banner */}
      {event.actionable && event.actionSummary && (
        <div className="rounded-lg bg-emerald-950/30 border border-emerald-500/25 px-3 py-2 text-xs text-emerald-300">
          → {event.actionSummary}
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide' : 'Why this matters'}
      </button>

      {expanded && (
        <div className="rounded-lg bg-white/5 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
          <p>{event.relevanceReason}</p>
          {event.impactReason && (
            <p className={impact.color}>{event.impactReason}</p>
          )}
        </div>
      )}

      {/* Link */}
      {event.url && (
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-auto">
          <button className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs h-8 font-medium transition-colors">
            <ExternalLink className="h-3 w-3" />
            Open
          </button>
        </a>
      )}
    </div>
  );
}

// ── Live now section ──────────────────────────────────────────────────────────

function LiveSection({ events }: { events: XEvent[] }) {
  const live = events.filter((e) => e.urgency === 'live');
  if (live.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-950/10 p-4">
      <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-3">
        <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
        Live Right Now ({live.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {live.map((e) => {
          const cfg = TYPE_CONFIG[e.type];
          return (
            <div
              key={e.title}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${cfg.bg}`}
            >
              <cfg.Icon className={`h-3 w-3 ${cfg.color}`} />
              <span className={cfg.color}>{e.title}</span>
              {e.url && (
                <a href={e.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className={`h-3 w-3 ${cfg.color} opacity-60 hover:opacity-100`} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function XEventsClient({ events }: XEventsClientProps) {
  const [type, setType]       = useState<TypeFilter>('all');
  const [urgency, setUrgency] = useState<UrgencyFilter>('all');
  const [impact, setImpact]   = useState<ImpactFilter>('all');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort]       = useState<SortKey>('urgency');
  const [actionableOnly, setActionableOnly] = useState(false);

  const filtered = useMemo(() => {
    let r = events;
    if (type !== 'all')      r = r.filter((e) => e.type === type);
    if (urgency !== 'all')   r = r.filter((e) => e.urgency === urgency);
    if (impact !== 'all')    r = r.filter((e) => e.priceImpact === impact);
    if (minScore > 0)        r = r.filter((e) => e.relevanceScore >= minScore);
    if (actionableOnly)      r = r.filter((e) => e.actionable);

    const urgencyOrder: Record<XEvent['urgency'], number> = {
      live: 0, today: 1, this_week: 2, upcoming: 3,
    };

    return [...r].sort((a, b) => {
      if (sort === 'urgency')    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.relevanceScore - a.relevanceScore;
      if (sort === 'relevance')  return b.relevanceScore - a.relevanceScore;
      if (sort === 'engagement') return (b.engagementCount ?? 0) - (a.engagementCount ?? 0);
      return 0;
    });
  }, [events, type, urgency, impact, minScore, actionableOnly, sort]);

  const types: TypeFilter[]     = ['all', 'space', 'viral_thread', 'kol_alert', 'airdrop', 'token_unlock', 'listing'];
  const urgencies: UrgencyFilter[] = ['all', 'live', 'today', 'this_week', 'upcoming'];
  const impacts: ImpactFilter[] = ['all', 'bullish', 'bearish', 'neutral'];
  const sorts: { key: SortKey; label: string }[] = [
    { key: 'urgency',    label: 'Urgency'    },
    { key: 'relevance',  label: 'Relevance'  },
    { key: 'engagement', label: 'Engagement' },
  ];

  // Count by type for filter badges
  const typeCounts = useMemo(
    () => Object.fromEntries(types.slice(1).map((t) => [t, events.filter((e) => e.type === t).length])),
    [events],
  );

  return (
    <div className="flex flex-col gap-6">
      <LiveSection events={events} />

      {/* Impact summary row */}
      <div className="flex gap-3">
        {(['bullish', 'bearish'] as const).map((imp) => {
          const count = events.filter((e) => e.priceImpact === imp).length;
          const cfg   = IMPACT_CONFIG[imp];
          const Icon  = imp === 'bullish' ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={imp} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
              <span>{count} {cfg.label.replace('↑ ', '').replace('↓ ', '')} catalyst{count !== 1 ? 's' : ''}</span>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-start">
        {/* Type chips */}
        <div className="flex flex-wrap gap-1">
          {types.map((t) => {
            const label = t === 'all' ? 'All Types' : TYPE_CONFIG[t].label;
            const count = t !== 'all' ? typeCounts[t] : undefined;
            return (
              <Chip key={t} label={count !== undefined ? `${label} (${count})` : label}
                active={type === t} color="violet" onClick={() => setType(t)} />
            );
          })}
        </div>

        {/* Urgency */}
        <div className="flex gap-1">
          {urgencies.map((u) => (
            <Chip key={u}
              label={u === 'all' ? 'All Time' : URGENCY_CONFIG[u].label}
              active={urgency === u} color="rose" onClick={() => setUrgency(u)} />
          ))}
        </div>

        {/* Impact */}
        <div className="flex gap-1">
          {impacts.map((i) => (
            <Chip key={i}
              label={i === 'all' ? 'All Impact' : IMPACT_CONFIG[i].label.replace('↑ ', '').replace('↓ ', '').replace('→ ', '')}
              active={impact === i} color="emerald" onClick={() => setImpact(i)} />
          ))}
        </div>

        {/* Actionable toggle */}
        <Chip label="⚡ Actionable Only" active={actionableOnly} color="orange"
          onClick={() => setActionableOnly((p) => !p)} />

        {/* Sort */}
        <div className="flex gap-1 ml-auto">
          {sorts.map((s) => (
            <Chip key={s.key} label={s.label} active={sort === s.key} color="sky"
              onClick={() => setSort(s.key)} />
          ))}
        </div>
      </div>

      {/* Min relevance slider */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground whitespace-nowrap w-32">
          Min Relevance: {minScore}
        </span>
        <input
          type="range"
          min={0}
          max={9}
          step={1}
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="max-w-xs accent-violet-500"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {events.length} events
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
          No events match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((e) => (
            <EventCard key={`${e.type}-${e.title}`} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useMemo, useRef } from 'react';
import type { Idea, WeeklyReport } from '@/lib/agents/ideas';
import {
  Hammer, TrendingUp, Layers, FileText,
  ChevronDown, ChevronUp, Sparkles, X,
  Clock, Zap, AlertTriangle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IdeasClientProps {
  ideas: Idea[];
  weeklyReport: WeeklyReport | null;
}

type Tab = 'all' | 'build' | 'trade' | 'narrative' | 'report';
type SortKey = 'conviction' | 'time' | 'risk';

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<Idea['type'], { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  build:     { label: 'Build',     color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', Icon: Hammer     },
  trade:     { label: 'Trade',     color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30',    Icon: TrendingUp },
  narrative: { label: 'Narrative', color: 'text-violet-300',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  Icon: Layers     },
};

const RISK_COLORS: Record<Idea['risk'], string> = {
  low:    'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  medium: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  high:   'text-red-400 bg-red-500/15 border-red-500/30',
};

const HORIZON_CONFIG: Record<Idea['timeHorizon'], { label: string; color: string }> = {
  now:     { label: 'Act Now',    color: 'text-red-400'    },
  days:    { label: 'Days',       color: 'text-orange-400' },
  weeks:   { label: 'Weeks',      color: 'text-yellow-400' },
  months:  { label: 'Months',     color: 'text-slate-400'  },
};

const CHAIN_COLORS: Record<string, string> = {
  sol:      'bg-purple-500/20 text-purple-300',
  eth:      'bg-blue-500/20 text-blue-300',
  base:     'bg-sky-500/20 text-sky-300',
  arbitrum: 'bg-cyan-500/20 text-cyan-300',
  polygon:  'bg-violet-500/20 text-violet-300',
  bnb:      'bg-yellow-500/20 text-yellow-300',
};

// ── Brief modal ───────────────────────────────────────────────────────────────

function BriefModal({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const abortRef              = useRef<AbortController | null>(null);

  async function generateBrief() {
    setLoading(true);
    setStarted(true);
    setText('');
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ideas/brief', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  abortRef.current.signal,
        body: JSON.stringify({
          title:       idea.title,
          tldr:        idea.tldr,
          type:        idea.type,
          body:        idea.body,
          chains:      idea.chains,
          tickers:     idea.tickers,
          actionItems: idea.actionItems,
        }),
      });

      if (!res.ok || !res.body) { setText('Failed to generate brief.'); return; }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try { setText((p) => p + (JSON.parse(line.slice(2)) as string)); } catch { /* skip */ }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setText((p) => p + '\n\n[Generation stopped]');
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
  }

  const cfg = TYPE_CONFIG[idea.type];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-background shadow-2xl mt-8 mb-8">
        {/* Header */}
        <div className={`flex items-start gap-3 p-5 border-b border-border`}>
          <div className={`mt-0.5 flex-shrink-0 rounded-lg p-2 ${cfg.bg} ${cfg.border} border`}>
            <cfg.Icon className={`h-4 w-4 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${cfg.color} mb-0.5`}>{cfg.label} Brief</p>
            <h2 className="text-base font-bold leading-snug">{idea.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">{idea.tldr}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {!started ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Sparkles className="h-8 w-8 text-violet-400" />
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Generate a full detailed brief with market analysis, technical architecture,
                and concrete action plan using Claude Opus.
              </p>
              <button
                onClick={generateBrief}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Generate Full Brief
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {loading && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-violet-300">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                    Generating with Claude Opus…
                  </div>
                  <button onClick={stop} className="text-xs text-muted-foreground hover:text-foreground">Stop</button>
                </div>
              )}
              <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap font-mono">
                {text || <span className="text-muted-foreground">Starting…</span>}
              </div>
              {!loading && text && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => navigator.clipboard.writeText(text)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-border transition-colors"
                  >
                    Copy
                  </button>
                  <button
                    onClick={generateBrief}
                    className="text-xs px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 transition-colors"
                  >
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Conviction dots ───────────────────────────────────────────────────────────

function ConvictionDots({ score }: { score: number }) {
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

// ── Idea card ─────────────────────────────────────────────────────────────────

function IdeaCard({ idea, onBrief }: { idea: Idea; onBrief: (idea: Idea) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg     = TYPE_CONFIG[idea.type];
  const horizon = HORIZON_CONFIG[idea.timeHorizon];
  const { Icon } = cfg;

  return (
    <div className={`rounded-xl border bg-card p-4 flex flex-col gap-3 ${
      idea.conviction >= 8 ? `${cfg.border} border` : 'border-border'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${cfg.bg} border ${cfg.border}`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className={`text-[10px] font-medium ${horizon.color} flex items-center gap-1`}>
              <Clock className="h-2.5 w-2.5" />
              {horizon.label}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${RISK_COLORS[idea.risk]}`}>
              {idea.risk.toUpperCase()} RISK
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-snug">{idea.title}</h3>
        </div>
      </div>

      {/* TL;DR */}
      <p className="text-xs text-muted-foreground leading-relaxed">{idea.tldr}</p>

      {/* Conviction */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-16">Conviction</span>
        <ConvictionDots score={idea.conviction} />
        <span className={`text-[10px] font-bold ml-1 ${
          idea.conviction >= 8 ? 'text-emerald-400' :
          idea.conviction >= 5 ? 'text-yellow-400'  : 'text-slate-500'
        }`}>{idea.conviction}/10</span>
      </div>

      {/* Chains + tickers */}
      {(idea.chains.length > 0 || idea.tickers.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {idea.chains.map((c) => (
            <span key={c} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CHAIN_COLORS[c] ?? 'bg-slate-500/20 text-slate-300'}`}>
              {c.toUpperCase()}
            </span>
          ))}
          {idea.tickers.map((t) => (
            <span key={t} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-300">
              ${t}
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {idea.tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Source feeds */}
      {idea.sources.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Zap className="h-2.5 w-2.5" />
          From: {idea.sources.join(', ')}
        </div>
      )}

      {/* Expand */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide' : 'Full analysis + action items'}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-lg bg-white/5 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{idea.body}</p>
          {idea.actionItems.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Action Items</p>
              <ol className="space-y-1">
                {idea.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="flex-shrink-0 text-[10px] font-bold text-emerald-400 w-4">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Generate Brief button */}
      <button
        onClick={() => onBrief(idea)}
        className={`mt-auto flex items-center justify-center gap-1.5 rounded-lg text-xs h-8 font-medium transition-colors border ${cfg.bg} ${cfg.border} ${cfg.color} hover:brightness-125`}
      >
        <Sparkles className="h-3 w-3" />
        Generate Full Brief
      </button>
    </div>
  );
}

// ── Weekly report panel ───────────────────────────────────────────────────────

function WeeklyReportPanel({ report }: { report: WeeklyReport }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-violet-500/30 bg-violet-950/15 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-violet-300">Weekly Alpha Report</span>
          <span className="text-xs text-muted-foreground ml-auto">{report.generatedAt}</span>
        </div>
        <p className="text-lg font-bold leading-snug mb-4">{report.headline}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[10px] font-semibold text-violet-300 mb-1.5 uppercase tracking-wide">Top Narrative</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{report.topNarrative}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[10px] font-semibold text-emerald-300 mb-1.5 uppercase tracking-wide">Best Build Opp</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{report.topBuildOpp}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[10px] font-semibold text-cyan-300 mb-1.5 uppercase tracking-wide">Top Trade Setup</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{report.topTradeSetup}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Watchlist</p>
          <div className="flex flex-wrap gap-2">
            {report.watchlist.map((item) => (
              <span key={item} className="text-xs font-mono px-2 py-1 rounded bg-white/5 border border-border">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-orange-400" /> Key Risks
          </p>
          <ul className="space-y-1.5">
            {report.risks.map((risk) => (
              <li key={risk} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-orange-400 flex-shrink-0 mt-0.5">•</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IdeasClient({ ideas, weeklyReport }: IdeasClientProps) {
  const [tab, setTab]           = useState<Tab>('all');
  const [sort, setSort]         = useState<SortKey>('conviction');
  const [minConviction, setMin] = useState(0);
  const [briefIdea, setBriefIdea] = useState<Idea | null>(null);

  const filtered = useMemo(() => {
    let r = ideas;
    if (tab !== 'all' && tab !== 'report') r = r.filter((i) => i.type === tab);
    if (minConviction > 0) r = r.filter((i) => i.conviction >= minConviction);

    return [...r].sort((a, b) => {
      if (sort === 'conviction') return b.conviction - a.conviction;
      if (sort === 'risk') {
        const order = { low: 0, medium: 1, high: 2 };
        return order[a.risk] - order[b.risk];
      }
      const h = { now: 0, days: 1, weeks: 2, months: 3 };
      return h[a.timeHorizon] - h[b.timeHorizon];
    });
  }, [ideas, tab, sort, minConviction]);

  const tabs: { key: Tab; label: string; count?: number; Icon: React.ElementType }[] = [
    { key: 'all',       label: 'All Ideas',  count: ideas.length,                             Icon: Sparkles   },
    { key: 'build',     label: 'Build',      count: ideas.filter((i) => i.type === 'build').length,     Icon: Hammer     },
    { key: 'trade',     label: 'Trade',      count: ideas.filter((i) => i.type === 'trade').length,     Icon: TrendingUp },
    { key: 'narrative', label: 'Narrative',  count: ideas.filter((i) => i.type === 'narrative').length, Icon: Layers     },
    { key: 'report',    label: 'Weekly Report', Icon: FileText },
  ];

  const sorts: { key: SortKey; label: string }[] = [
    { key: 'conviction', label: 'Conviction' },
    { key: 'time',       label: 'Time Horizon' },
    { key: 'risk',       label: 'Lowest Risk' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {briefIdea && <BriefModal idea={briefIdea} onClose={() => setBriefIdea(null)} />}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border pb-0 -mb-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-muted-foreground'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Report tab */}
      {tab === 'report' ? (
        weeklyReport ? (
          <WeeklyReportPanel report={weeklyReport} />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
            No weekly report yet — trigger a rescan to generate one.
          </div>
        )
      ) : (
        <>
          {/* Filters row */}
          <div className="flex flex-wrap gap-3 items-center">
            {sorts.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  sort === s.key
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-card border-border text-muted-foreground hover:border-emerald-500/50'
                }`}
              >
                {s.label}
              </button>
            ))}

            <div className="flex items-center gap-3 ml-auto">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Min conviction: {minConviction || 'any'}
              </span>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={minConviction}
                onChange={(e) => setMin(Number(e.target.value))}
                className="max-w-[120px] accent-emerald-500"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {filtered.length} idea{filtered.length !== 1 ? 's' : ''}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
              No ideas match your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((idea) => (
                <IdeaCard key={idea.title} idea={idea} onBrief={setBriefIdea} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

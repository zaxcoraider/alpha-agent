'use client';

import { useState, useMemo } from 'react';
import type { NewsItem } from '@/lib/agents/news';

const CHAIN_COLORS: Record<string, string> = {
  sol:      'bg-purple-500/20 text-purple-400',
  eth:      'bg-blue-500/20 text-blue-400',
  arbitrum: 'bg-sky-500/20 text-sky-400',
  base:     'bg-blue-600/20 text-blue-300',
  polygon:  'bg-violet-500/20 text-violet-400',
  optimism: 'bg-red-500/20 text-red-400',
  bsc:      'bg-yellow-500/20 text-yellow-400',
  sui:      'bg-cyan-500/20 text-cyan-400',
  unknown:  'bg-muted text-muted-foreground',
};

const CATEGORY_COLORS: Record<string, string> = {
  hack:       'bg-red-500/20 text-red-400',
  funding:    'bg-green-500/20 text-green-400',
  regulation: 'bg-orange-500/20 text-orange-400',
  protocol:   'bg-blue-500/20 text-blue-400',
  defi:       'bg-emerald-500/20 text-emerald-400',
  nft:        'bg-pink-500/20 text-pink-400',
  meme:       'bg-yellow-500/20 text-yellow-400',
  infra:      'bg-sky-500/20 text-sky-400',
  tooling:    'bg-violet-500/20 text-violet-400',
  other:      'bg-muted text-muted-foreground',
};

const SENTIMENT_DOT: Record<string, string> = {
  bullish: 'bg-emerald-400',
  bearish: 'bg-red-400',
  neutral: 'bg-yellow-400',
};

const ALL_CHAINS = ['sol','eth','arbitrum','base','polygon','optimism','bsc','sui'];
const ALL_CATEGORIES = ['protocol','hack','funding','regulation','meme','infra','tooling','defi','nft','other'];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8
    ? 'bg-signal/15 text-signal border-signal/40'
    : score >= 5
    ? 'bg-risk-medium/10 text-risk-medium border-risk-medium/40'
    : 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono font-bold tabular-nums ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const age = Math.round((Date.now() - new Date(item.publishedAt).getTime()) / 60_000);
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  return (
    <div className="hud-panel rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium leading-snug hover:text-signal transition-colors"
        >
          {item.title}
        </a>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${SENTIMENT_DOT[item.sentiment] ?? 'bg-muted'}`} />
          <ScoreBadge score={item.score} />
        </div>
      </div>

      {item.whyRelevant && (
        <p className="text-xs text-muted-foreground">{item.whyRelevant}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${CATEGORY_COLORS[item.category] ?? 'bg-muted text-muted-foreground'}`}>
          {item.category}
        </span>
        {item.chains.map((c) => (
          <span key={c} className={`rounded-sm px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${CHAIN_COLORS[c] ?? CHAIN_COLORS.unknown}`}>
            {c}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground border-t border-border/60 pt-2">
        <span>{item.source}</span>
        <span>·</span>
        <span>{ageLabel}</span>
      </div>
    </div>
  );
}

interface Props {
  items: NewsItem[];
}

export function NewsClient({ items }: Props) {
  const [chainFilter, setChainFilter] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (chainFilter.length > 0 && !chainFilter.some((c) => item.chains.includes(c))) return false;
      if (catFilter.length > 0 && !catFilter.includes(item.category)) return false;
      if (item.score < minScore) return false;
      return true;
    });
  }, [items, chainFilter, catFilter, minScore]);

  function toggleChain(c: string) {
    setChainFilter((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }
  function toggleCat(c: string) {
    setCatFilter((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  return (
    <div className="space-y-4">
      {/* Chain filter */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_CHAINS.map((c) => (
          <button
            key={c}
            onClick={() => toggleChain(c)}
            className={`rounded-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide transition-colors border ${
              chainFilter.includes(c)
                ? `${CHAIN_COLORS[c]} border-transparent`
                : 'border-border text-muted-foreground hover:border-signal/30 hover:text-foreground'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Category + score filter */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => toggleCat(c)}
            className={`rounded-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide transition-colors border ${
              catFilter.includes(c)
                ? `${CATEGORY_COLORS[c]} border-transparent`
                : 'border-border text-muted-foreground hover:border-signal/30 hover:text-foreground'
            }`}
          >
            {c}
          </button>
        ))}
        <select
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="ml-auto rounded-sm border border-border bg-card px-2 py-1 text-[11px] font-mono text-muted-foreground"
        >
          <option value={0}>All scores</option>
          <option value={5}>Score ≥ 5</option>
          <option value={7}>Score ≥ 7</option>
          <option value={8}>Score ≥ 8 (hot)</option>
        </select>
      </div>

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {items.length} items
        {(chainFilter.length > 0 || catFilter.length > 0 || minScore > 0) && (
          <button
            onClick={() => { setChainFilter([]); setCatFilter([]); setMinScore(0); }}
            className="ml-2 underline hover:text-foreground"
          >
            clear filters
          </button>
        )}
      </p>

      {/* News cards */}
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((item) => (
          <NewsCard key={item.url} item={item} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="hud-panel rounded-lg p-12 text-center text-muted-foreground">
          <p className="text-sm">No items match the current filters.</p>
        </div>
      )}
    </div>
  );
}

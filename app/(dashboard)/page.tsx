import Link from 'next/link';
import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import {
  TrendingUp, Twitter, Gem, Newspaper,
  ArrowRight, Zap, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import type { MemeToken } from '@/lib/agents/memes';
import type { XEvent }     from '@/lib/agents/x-events';
import type { NFTMint }    from '@/lib/agents/nft-mints';
import type { NewsItem }   from '@/lib/agents/news';
import { RescanButton }    from './news/rescan-button';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getBriefData() {
  try {
    const [memeRows, eventRows, nftRows, newsRows, runs] = await Promise.all([
      db.select({ raw: scanResults.raw, score: scanResults.score, createdAt: scanResults.createdAt })
        .from(scanResults).where(eq(scanResults.agent, 'memes'))
        .orderBy(desc(scanResults.score)).limit(5),

      db.select({ raw: scanResults.raw, score: scanResults.score, createdAt: scanResults.createdAt })
        .from(scanResults).where(eq(scanResults.agent, 'x_events'))
        .orderBy(desc(scanResults.score)).limit(5),

      db.select({ raw: scanResults.raw, score: scanResults.score, createdAt: scanResults.createdAt })
        .from(scanResults).where(eq(scanResults.agent, 'nft'))
        .orderBy(desc(scanResults.score)).limit(5),

      db.select({ raw: scanResults.raw, score: scanResults.score, createdAt: scanResults.createdAt })
        .from(scanResults).where(eq(scanResults.agent, 'news'))
        .orderBy(desc(scanResults.score)).limit(5),

      db.select({ agent: scanRuns.agent, finishedAt: scanRuns.finishedAt, status: scanRuns.status })
        .from(scanRuns)
        .where(inArray(scanRuns.agent, ['memes', 'x_events', 'nft', 'news']))
        .orderBy(desc(scanRuns.finishedAt))
        .limit(20),
    ]);

    // Latest run per agent
    const lastRun: Record<string, typeof runs[0]> = {};
    for (const r of runs) {
      if (!lastRun[r.agent]) lastRun[r.agent] = r;
    }

    // Most recent scan timestamp across all agents
    const allFinished = runs.map((r) => r.finishedAt).filter(Boolean) as Date[];
    const lastUpdated = allFinished.length
      ? new Date(Math.max(...allFinished.map((d) => d.getTime())))
      : null;

    return {
      memes:       memeRows.map((r) => r.raw as MemeToken).filter(Boolean),
      events:      eventRows.map((r) => r.raw as XEvent).filter(Boolean),
      mints:       nftRows.map((r) => r.raw as NFTMint).filter(Boolean),
      news:        newsRows.map((r) => r.raw as NewsItem).filter(Boolean),
      lastRun,
      lastUpdated,
    };
  } catch {
    return { memes: [], events: [], mints: [], news: [], lastRun: {}, lastUpdated: null };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rugColor(risk: string) {
  return risk === 'low'      ? 'text-emerald-400'
       : risk === 'medium'   ? 'text-yellow-400'
       : risk === 'high'     ? 'text-orange-400'
       :                       'text-red-500';
}

function urgencyBadge(urgency: string) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
  return urgency === 'live'      ? `${base} bg-red-500/15 text-red-400`
       : urgency === 'today'     ? `${base} bg-orange-500/15 text-orange-400`
       : urgency === 'this_week' ? `${base} bg-yellow-500/15 text-yellow-400`
       :                           `${base} bg-muted text-muted-foreground`;
}

function impactDot(impact: string) {
  return impact === 'bullish' ? 'bg-emerald-400'
       : impact === 'bearish' ? 'bg-red-400'
       :                        'bg-muted-foreground';
}

function formatDate(d: Date | null) {
  if (!d) return null;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MorningBriefPage() {
  const { memes, events, mints, news, lastRun, lastUpdated } = await getBriefData();

  const totalSignals = memes.length + events.length + mints.length + news.length;
  const topMeme      = memes[0];
  const liveEvents   = events.filter((e) => e.urgency === 'live').length;
  const freeMints    = mints.filter((m) => m.isFree).length;
  const highNews     = news.filter((n) => n.score >= 8).length;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Zap size={13} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold">Morning Brief</h1>
          </div>
          <p className="text-sm text-muted-foreground">{today}</p>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock size={10} />
              Last updated {formatDate(lastUpdated)}
            </p>
          )}
        </div>

        {/* Scan all buttons */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <RescanButton agent="memes" />
          <RescanButton agent="x_events" />
          <RescanButton agent="nft_mints" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={totalSignals} label="Total signals" color="text-foreground" />
        <StatCard value={liveEvents}   label="Live events"   color="text-red-400" />
        <StatCard value={freeMints}    label="Free mints"    color="text-emerald-400" />
        <StatCard value={highNews}     label="High-score news" color="text-blue-400" />
      </div>

      {/* Empty state */}
      {totalSignals === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground text-sm mb-1">No data yet — run the scanners first.</p>
          <p className="text-muted-foreground text-xs">
            Click the Scan buttons above or visit each tab and hit Scan Now.
          </p>
        </div>
      )}

      {/* ── Meme Radar top picks ────────────────────────────────────────────── */}
      {memes.length > 0 && (
        <Section
          icon={<TrendingUp size={15} className="text-emerald-400" />}
          title="Top Meme Gems"
          viewAllHref="/memes"
          count={memes.length}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {memes.slice(0, 3).map((t, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-sm">{t.name}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">${t.ticker}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <GemScoreBadge score={t.gemScore} />
                    <ChainBadge chain={t.chain} />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">{t.narrative}</p>

                <div className="flex items-center justify-between text-xs mt-auto pt-1 border-t border-border">
                  <span className={rugColor(t.rugRisk)}>
                    {t.rugRisk === 'low' ? '✓' : '⚠'} {t.rugRisk} risk
                  </span>
                  <span className={
                    t.watchAction === 'buy_small' ? 'text-emerald-400 font-semibold'
                    : t.watchAction === 'avoid'   ? 'text-red-400'
                    :                               'text-yellow-400'
                  }>
                    {t.watchAction === 'buy_small' ? 'BUY SMALL' : t.watchAction === 'avoid' ? 'AVOID' : 'WATCH'}
                  </span>
                </div>

                {t.dexUrl && (
                  <a href={t.dexUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
                    DexScreener <ArrowRight size={9} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── X Events top picks ──────────────────────────────────────────────── */}
      {events.length > 0 && (
        <Section
          icon={<Twitter size={15} className="text-sky-400" />}
          title="X Events"
          viewAllHref="/x-events"
          count={events.length}
        >
          <div className="flex flex-col gap-2">
            {events.slice(0, 4).map((e, i) => (
              <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 flex items-start gap-3">
                <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${impactDot(e.priceImpact)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{e.title}</span>
                    <span className={urgencyBadge(e.urgency)}>
                      {e.urgency === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />}
                      {e.urgency.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{e.actionSummary}</p>
                </div>
                <div className="shrink-0 text-xs font-bold text-emerald-400">{e.relevanceScore}/10</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── NFT Mints top picks ──────────────────────────────────────────────── */}
      {mints.length > 0 && (
        <Section
          icon={<Gem size={15} className="text-violet-400" />}
          title="NFT Mints to Watch"
          viewAllHref="/nft-mints"
          count={mints.length}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mints.slice(0, 3).map((m, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm">{m.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <AlphaScoreBadge score={m.alphaScore} />
                    <ChainBadge chain={m.chain} />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={m.isFree ? 'text-emerald-400 font-semibold' : ''}>
                    {m.isFree ? 'FREE' : `${m.mintPrice} ${m.mintPriceCurrency}`}
                  </span>
                  <MintStatusBadge status={m.mintStatus} />
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">{m.alphaBreakdown}</p>

                <div className="flex items-center justify-between text-xs mt-auto pt-1 border-t border-border">
                  <span className={rugColor(m.rugRisk)}>
                    {m.rugRisk === 'low' ? '✓' : '⚠'} {m.rugRisk} risk
                  </span>
                  {m.mintLink && (
                    <a href={m.mintLink} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                      Mint <ArrowRight size={9} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Top News ────────────────────────────────────────────────────────── */}
      {news.length > 0 && (
        <Section
          icon={<Newspaper size={15} className="text-blue-400" />}
          title="Top News"
          viewAllHref="/news"
          count={news.length}
        >
          <div className="flex flex-col gap-2">
            {news.slice(0, 4).map((n, i) => (
              <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 flex items-start gap-3">
                <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                  n.sentiment === 'bullish' ? 'bg-emerald-400'
                  : n.sentiment === 'bearish' ? 'bg-red-400'
                  : 'bg-muted-foreground'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.whyRelevant}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`text-xs font-bold ${Number(n.score) >= 8 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                    {Number(n.score).toFixed(1)}
                  </span>
                  {n.url && (
                    <a href={n.url} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground">
                      <ArrowRight size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Section({
  icon, title, viewAllHref, count, children,
}: {
  icon: React.ReactNode;
  title: string;
  viewAllHref: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        <Link href={viewAllHref}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      {children}
    </div>
  );
}

function GemScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500/15 text-emerald-400'
              : score >= 50 ? 'bg-yellow-500/15 text-yellow-400'
              :               'bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>
      {score}
    </span>
  );
}

function AlphaScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500/15 text-emerald-400'
              : score >= 50 ? 'bg-yellow-500/15 text-yellow-400'
              :               'bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>
      α{score}
    </span>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
      {chain}
    </span>
  );
}

function MintStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    live:         'text-emerald-400',
    ending_soon:  'text-orange-400',
    not_started:  'text-muted-foreground',
    sold_out:     'text-red-400',
  };
  const labels: Record<string, string> = {
    live:         '● LIVE',
    ending_soon:  '⚡ ENDING SOON',
    not_started:  '○ NOT STARTED',
    sold_out:     '✕ SOLD OUT',
  };
  return (
    <span className={`font-semibold ${styles[status] ?? 'text-muted-foreground'}`}>
      {labels[status] ?? status}
    </span>
  );
}

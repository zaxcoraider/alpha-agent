import Link from 'next/link';
import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { ArrowRight, TrendingUp, Twitter, Gem, Newspaper } from 'lucide-react';
import type { MemeToken } from '@/lib/agents/memes';
import type { XEvent }     from '@/lib/agents/x-events';
import type { NFTMint }    from '@/lib/agents/nft-mints';
import type { NewsItem }   from '@/lib/agents/news';
import { RescanButton }    from './news/rescan-button';
import { StatusBar }       from '@/components/brief/status-bar';
import { ScannerRail }     from '@/components/brief/scanner-rail';
import { ScanPulse }       from '@/components/brief/scan-pulse';

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

    const lastRun: Record<string, typeof runs[0]> = {};
    for (const r of runs) if (!lastRun[r.agent]) lastRun[r.agent] = r;

    const allFinished = runs.map((r) => r.finishedAt).filter(Boolean) as Date[];
    const lastUpdated = allFinished.length
      ? new Date(Math.max(...allFinished.map((d) => d.getTime())))
      : null;

    return {
      memes:  memeRows.map((r) => r.raw as MemeToken).filter(Boolean),
      events: eventRows.map((r) => r.raw as XEvent).filter(Boolean),
      mints:  nftRows.map((r) => r.raw as NFTMint).filter(Boolean),
      news:   newsRows.map((r) => r.raw as NewsItem).filter(Boolean),
      lastUpdated,
    };
  } catch {
    return { memes: [], events: [], mints: [], news: [], lastUpdated: null };
  }
}

// ── Visual helpers ────────────────────────────────────────────────────────────

const rugClass = (risk: string) =>
  risk === 'low'      ? 'text-risk-low'
  : risk === 'medium' ? 'text-risk-medium'
  : risk === 'high'   ? 'text-risk-high'
  :                     'text-risk-critical';

const impactDot = (impact: string) =>
  impact === 'bullish' ? 'bg-risk-low'
  : impact === 'bearish' ? 'bg-risk-critical'
  : 'bg-muted-foreground';

const urgencyClass = (urgency: string) => {
  const base = 'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-mono tracking-widest uppercase';
  return urgency === 'live'      ? `${base} bg-red-500/10 text-red-400 border border-red-500/30`
       : urgency === 'today'     ? `${base} bg-orange-500/10 text-orange-400 border border-orange-500/30`
       : urgency === 'this_week' ? `${base} bg-yellow-500/10 text-yellow-400 border border-yellow-500/30`
       :                           `${base} bg-muted text-muted-foreground border border-border`;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MorningBriefPage() {
  const { memes, events, mints, news, lastUpdated } = await getBriefData();

  const totalSignals = memes.length + events.length + mints.length + news.length;
  const liveEvents   = events.filter((e) => e.urgency === 'live').length;
  const freeMints    = mints.filter((m) => m.isFree).length;
  const highNews     = news.filter((n) => n.score >= 8).length;

  // Counts feeding the scanner rail. dev_events / ideas / prediction not
  // surfaced on the Morning Brief yet — Phase 2 extends the brief query.
  const counts = {
    memes:    memes.length,
    x_events: events.length,
    nft:      mints.length,
    news:     news.length,
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // Visual: layers with data = "active" segments in the status bar pulse.
  const activeLayersFromData = [counts.memes, counts.x_events, counts.nft, counts.news]
    .filter((n) => n > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <StatusBar
        lastUpdatedIso={lastUpdated ? lastUpdated.toISOString() : null}
        activeLayers={activeLayersFromData}
        totalLayers={7}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="hud-panel rounded-lg p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <ScanPulse size={84} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-signal mb-1">
            // MORNING BRIEF
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {today}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {totalSignals > 0
              ? <><span className="font-mono text-foreground">{totalSignals}</span> signals across 4 active layers · ranked by score</>
              : 'No data yet — run the scanners to begin.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <RescanButton agent="memes" />
          <RescanButton agent="x_events" />
          <RescanButton agent="nft_mints" />
        </div>
      </div>

      {/* ── Main grid: scanner rail + content ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
        <ScannerRail counts={counts} />

        <div className="flex flex-col gap-5 min-w-0">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat value={totalSignals} label="Total signals" tone="default" />
            <Stat value={liveEvents}   label="Live events"   tone="critical" />
            <Stat value={freeMints}    label="Free mints"    tone="signal" />
            <Stat value={highNews}     label="High news"     tone="blue" />
          </div>

          {/* Empty state */}
          {totalSignals === 0 && (
            <div className="hud-panel rounded-lg p-12 text-center">
              <p className="text-muted-foreground text-sm mb-1">No data yet — run the scanners first.</p>
              <p className="text-muted-foreground/60 text-xs">
                Click the Scan buttons above, or visit each tab and hit Scan Now.
              </p>
            </div>
          )}

          {/* ── Top Memes ─────────────────────────────────────────────────── */}
          {memes.length > 0 && (
            <Section
              icon={<TrendingUp size={14} className="text-signal" />}
              title="Top Meme Gems"
              viewAllHref="/memes"
              count={memes.length}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {memes.slice(0, 3).map((t, i) => (
                  <div key={i} className="hud-panel rounded-lg p-3.5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-sm">{t.name}</span>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">${t.ticker}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ScoreBadge value={t.gemScore} />
                        <ChainBadge chain={t.chain} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.narrative}</p>
                    <div className="flex items-center justify-between text-[11px] mt-auto pt-2 border-t border-border/60 font-mono tracking-wide uppercase">
                      <span className={rugClass(t.rugRisk)}>
                        {t.rugRisk === 'low' ? '✓' : '⚠'} {t.rugRisk}
                      </span>
                      <span className={
                        t.watchAction === 'buy_small' ? 'text-signal font-bold'
                        : t.watchAction === 'avoid'   ? 'text-risk-critical'
                        :                               'text-risk-medium'
                      }>
                        {t.watchAction === 'buy_small' ? 'BUY SMALL' : t.watchAction === 'avoid' ? 'AVOID' : 'WATCH'}
                      </span>
                    </div>
                    {t.dexUrl && (
                      <a href={t.dexUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-signal flex items-center gap-1 w-fit transition-colors">
                        DexScreener <ArrowRight size={9} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── X Events ──────────────────────────────────────────────────── */}
          {events.length > 0 && (
            <Section
              icon={<Twitter size={14} className="text-sky-400" />}
              title="X Events"
              viewAllHref="/x-events"
              count={events.length}
            >
              <div className="flex flex-col gap-1.5">
                {events.slice(0, 4).map((e, i) => (
                  <div key={i} className="hud-panel rounded-lg px-4 py-3 flex items-start gap-3">
                    <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${impactDot(e.priceImpact)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium">{e.title}</span>
                        <span className={urgencyClass(e.urgency)}>
                          {e.urgency === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse-dot" />}
                          {e.urgency.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{e.actionSummary}</p>
                    </div>
                    <div className="shrink-0 font-mono text-xs font-bold text-signal">
                      {e.relevanceScore}<span className="text-muted-foreground/50">/10</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── NFT Mints ─────────────────────────────────────────────────── */}
          {mints.length > 0 && (
            <Section
              icon={<Gem size={14} className="text-violet-400" />}
              title="NFT Mints to Watch"
              viewAllHref="/nft-mints"
              count={mints.length}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {mints.slice(0, 3).map((m, i) => (
                  <div key={i} className="hud-panel rounded-lg p-3.5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{m.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <AlphaBadge value={m.alphaScore} />
                        <ChainBadge chain={m.chain} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className={m.isFree ? 'text-signal font-semibold' : 'text-muted-foreground'}>
                        {m.isFree ? 'FREE' : `${m.mintPrice} ${m.mintPriceCurrency}`}
                      </span>
                      <MintStatusBadge status={m.mintStatus} />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{m.alphaBreakdown}</p>
                    <div className="flex items-center justify-between text-[11px] mt-auto pt-2 border-t border-border/60 font-mono tracking-wide uppercase">
                      <span className={rugClass(m.rugRisk)}>
                        {m.rugRisk === 'low' ? '✓' : '⚠'} {m.rugRisk}
                      </span>
                      {m.mintLink && (
                        <a href={m.mintLink} target="_blank" rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-signal flex items-center gap-1 transition-colors">
                          Mint <ArrowRight size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Top News ──────────────────────────────────────────────────── */}
          {news.length > 0 && (
            <Section
              icon={<Newspaper size={14} className="text-blue-400" />}
              title="Top News"
              viewAllHref="/news"
              count={news.length}
            >
              <div className="flex flex-col gap-1.5">
                {news.slice(0, 4).map((n, i) => (
                  <div key={i} className="hud-panel rounded-lg px-4 py-3 flex items-start gap-3">
                    <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                      n.sentiment === 'bullish' ? 'bg-risk-low'
                      : n.sentiment === 'bearish' ? 'bg-risk-critical'
                      : 'bg-muted-foreground'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.whyRelevant}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`font-mono text-xs font-bold ${Number(n.score) >= 8 ? 'text-signal' : 'text-muted-foreground'}`}>
                        {Number(n.score).toFixed(1)}
                      </span>
                      {n.url && (
                        <a href={n.url} target="_blank" rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-signal transition-colors">
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
      </div>

      {/* ── Keyboard hint footer ─────────────────────────────────────────── */}
      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] font-mono tracking-wider uppercase text-muted-foreground/50">
        <span>Plantir Terminal</span>
        <span className="opacity-50">//</span>
        <span>v0.1</span>
        <span className="opacity-50">//</span>
        <span>Press <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border">S</kbd> to scan</span>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({
  value, label, tone,
}: {
  value: number;
  label: string;
  tone: 'default' | 'critical' | 'signal' | 'blue';
}) {
  const valueClass =
    tone === 'critical' ? 'text-risk-critical'
    : tone === 'signal' ? 'text-signal'
    : tone === 'blue'   ? 'text-blue-400'
    :                     'text-foreground';

  return (
    <div className="hud-panel rounded-lg p-3.5">
      <p className={`font-mono text-3xl font-bold tabular-nums ${valueClass}`}>
        {String(value).padStart(2, '0')}
      </p>
      <p className="mt-1 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{label}</p>
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
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
          <span className="font-mono text-[10px] text-muted-foreground">[{String(count).padStart(2, '0')}]</span>
        </div>
        <Link href={viewAllHref}
          className="flex items-center gap-1 text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-signal transition-colors">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      {children}
    </div>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const klass = value >= 70 ? 'bg-signal/15 text-signal border-signal/40'
              : value >= 50 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/40'
              :               'bg-muted text-muted-foreground border-border';
  return (
    <span className={`font-mono rounded-sm px-1.5 py-0.5 text-[10px] font-bold border ${klass}`}>
      {value}
    </span>
  );
}

function AlphaBadge({ value }: { value: number }) {
  const klass = value >= 70 ? 'bg-signal/15 text-signal border-signal/40'
              : value >= 50 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/40'
              :               'bg-muted text-muted-foreground border-border';
  return (
    <span className={`font-mono rounded-sm px-1.5 py-0.5 text-[10px] font-bold border ${klass}`}>
      α{value}
    </span>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground border border-border">
      {chain}
    </span>
  );
}

function MintStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    live:         'text-signal',
    ending_soon:  'text-risk-high',
    not_started:  'text-muted-foreground',
    sold_out:     'text-risk-critical',
  };
  const labels: Record<string, string> = {
    live:         '● LIVE',
    ending_soon:  '⚡ ENDING',
    not_started:  '○ UPCOMING',
    sold_out:     '✕ SOLD OUT',
  };
  return (
    <span className={`font-semibold tracking-wider text-[10px] ${styles[status] ?? 'text-muted-foreground'}`}>
      {labels[status] ?? status}
    </span>
  );
}

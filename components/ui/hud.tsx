// ── Shared HUD primitives ──────────────────────────────────────────────────────
// The visual language established on the Morning Brief tab, factored out so every
// tab stays consistent: mono "// eyebrow" labels, hud-panel surfaces, the signal
// accent + risk severity ramp, tabular-nums numerics. Presentational only.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ── Page header — mono eyebrow + title + subtitle, optional right-side actions ──

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="hud-panel rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-signal mb-1">
          // {eyebrow}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {meta && <p className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ── Stat card — mono numeral + tracked-out label ───────────────────────────────

type StatTone = 'default' | 'critical' | 'signal' | 'blue' | 'violet' | 'amber';

const STAT_TONE: Record<StatTone, string> = {
  default:  'text-foreground',
  critical: 'text-risk-critical',
  signal:   'text-signal',
  blue:     'text-blue-400',
  violet:   'text-violet-400',
  amber:    'text-risk-medium',
};

export function Stat({
  value,
  label,
  tone = 'default',
  pad = true,
}: {
  value: string | number;
  label: string;
  tone?: StatTone;
  pad?: boolean;
}) {
  const display = pad && typeof value === 'number' ? String(value).padStart(2, '0') : value;
  return (
    <div className="hud-panel rounded-lg p-3.5">
      <p className={cn('font-mono text-3xl font-bold tabular-nums', STAT_TONE[tone])}>{display}</p>
      <p className="mt-1 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>;
}

// ── Section label — "// TITLE [NN]" with optional view-all link ─────────────────

export function SectionLabel({
  icon,
  title,
  count,
  viewAllHref,
}: {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  viewAllHref?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
        {count !== undefined && (
          <span className="font-mono text-[10px] text-muted-foreground">[{String(count).padStart(2, '0')}]</span>
        )}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-signal transition-colors"
        >
          View all <ArrowRight size={11} />
        </Link>
      )}
    </div>
  );
}

// ── Empty state — dashed hud surface ────────────────────────────────────────────

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="hud-panel rounded-lg p-12 sm:p-16 text-center">
      {icon && (
        <div className="h-12 w-12 rounded-lg bg-muted/40 flex items-center justify-center mx-auto mb-4 text-muted-foreground/40">
          {icon}
        </div>
      )}
      <p className="text-sm text-muted-foreground font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/60 mt-1.5">{hint}</p>}
    </div>
  );
}

// ── Filter chip — HUD pill, signal accent when active ───────────────────────────

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-sm px-2.5 py-1 text-[11px] font-mono tracking-wide uppercase border transition-colors',
        active
          ? 'bg-signal/15 text-signal border-signal/40'
          : 'bg-card text-muted-foreground border-border hover:border-signal/30 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

// ── Score badge — mono, signal/severity tinted ──────────────────────────────────

export function ScoreBadge({
  value,
  suffix,
  good = 70,
  ok = 50,
}: {
  value: number;
  suffix?: string;
  good?: number;
  ok?: number;
}) {
  const klass =
    value >= good ? 'bg-signal/15 text-signal border-signal/40'
    : value >= ok ? 'bg-risk-medium/10 text-risk-medium border-risk-medium/40'
    :               'bg-muted text-muted-foreground border-border';
  return (
    <span className={cn('font-mono rounded-sm px-1.5 py-0.5 text-[10px] font-bold border', klass)}>
      {suffix}{value}
    </span>
  );
}

// ── Chain badge — neutral mono tag ──────────────────────────────────────────────

export function ChainBadge({ chain }: { chain: string }) {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground border border-border">
      {chain}
    </span>
  );
}

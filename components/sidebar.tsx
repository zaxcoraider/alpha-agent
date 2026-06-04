'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sunrise, Newspaper, Gem, Lightbulb, TrendingUp,
  Twitter, Code2, BarChart2, MessageSquare, Zap, LogOut,
  PanelLeftClose, PanelLeftOpen, X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useNav } from '@/components/nav-context';

const NAV = [
  { href: '/',           label: 'Morning Brief', icon: Sunrise,       group: 'overview' },
  { href: '/prediction', label: 'Prediction',    icon: BarChart2,     group: 'markets'  },
  { href: '/news',       label: 'News',          icon: Newspaper,     group: 'intel'    },
  { href: '/x-events',   label: 'X Events',      icon: Twitter,       group: 'intel'    },
  { href: '/nft-mints',  label: 'NFT Mints',     icon: Gem,           group: 'intel'    },
  { href: '/memes',      label: 'Meme Radar',    icon: TrendingUp,    group: 'intel'    },
  { href: '/ideas',      label: 'Build Ideas',   icon: Lightbulb,     group: 'build'    },
  { href: '/dev-events', label: 'Dev Events',    icon: Code2,         group: 'build'    },
  { href: '/chat',       label: 'Chat',          icon: MessageSquare, group: 'tools'    },
];

const GROUP_LABELS: Record<string, string> = {
  overview: 'Overview',
  markets:  'Markets',
  intel:    'Intelligence',
  build:    'Builder',
  tools:    'Tools',
};

const groups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
  (acc[item.group] ??= []).push(item);
  return acc;
}, {});

async function signOut() {
  await fetch('/api/auth', { method: 'DELETE' });
  window.location.href = '/login';
}

// ── Nav links (shared by desktop rail + mobile drawer) ──────────────────────────

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          {!collapsed && (
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {GROUP_LABELS[group]}
            </p>
          )}
          <div className="space-y-0.5">
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150',
                    collapsed && 'justify-center px-0',
                    active
                      ? 'bg-signal/10 text-signal border border-signal/20 glow-emerald-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent',
                  )}
                >
                  <Icon
                    size={15}
                    className={cn(
                      'shrink-0 transition-colors',
                      active ? 'text-signal' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                  {!collapsed && active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-signal animate-pulse-dot shrink-0" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/10 border border-signal/20 glow-emerald-sm shrink-0">
        <Zap size={15} className="text-signal" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-foreground">PLANTIR</p>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Crypto Intel Terminal</p>
        </div>
      )}
    </div>
  );
}

function Footer({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-t border-border px-3 py-3 space-y-2">
      {!collapsed && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-signal animate-pulse-dot shrink-0" />
          <span className="text-xs text-muted-foreground">Live · DGrid connected</span>
        </div>
      )}
      <button
        onClick={signOut}
        title={collapsed ? 'Sign out' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/50 hover:text-risk-critical hover:bg-risk-critical/5 transition-all',
          collapsed && 'justify-center px-0',
        )}
      >
        <LogOut size={12} />
        {!collapsed && <span>Sign out</span>}
      </button>
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useNav();

  return (
    <>
      {/* ── Desktop rail (collapsible) ─────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden md:flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200 ease-out',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <div className={cn('flex items-center border-b border-border px-3 py-5', collapsed ? 'justify-center' : 'justify-between')}>
          <Brand collapsed={collapsed} />
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="text-muted-foreground/60 hover:text-signal transition-colors shrink-0"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="mx-auto mt-2 text-muted-foreground/60 hover:text-signal transition-colors"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        <NavLinks collapsed={collapsed} />
        <Footer collapsed={collapsed} />
      </aside>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Panel */}
          <aside className="absolute left-0 top-0 h-full w-64 flex flex-col border-r border-border bg-card shadow-2xl animate-slide-in-left">
            <div className="flex items-center justify-between border-b border-border px-4 py-5">
              <Brand collapsed={false} />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <Footer collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}

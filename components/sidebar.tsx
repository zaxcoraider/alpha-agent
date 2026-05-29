'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sunrise, Newspaper, Gem, Lightbulb, TrendingUp,
  Twitter, Code2, BarChart2, MessageSquare, Zap, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

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

export function Sidebar() {
  const pathname = usePathname();

  // Group nav items
  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <aside className="hidden md:flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 glow-emerald-sm shrink-0">
          <Zap size={15} className="text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-foreground">PLANTIR</p>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Crypto Intel Terminal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {GROUP_LABELS[group]}
            </p>
            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150',
                      active
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 glow-emerald-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent'
                    )}
                  >
                    <Icon
                      size={15}
                      className={cn(
                        'shrink-0 transition-colors',
                        active ? 'text-emerald-400' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    <span className="truncate">{label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-dot shrink-0" />
          <span className="text-xs text-muted-foreground">Live · DGrid connected</span>
        </div>
        <button
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' });
            window.location.href = '/login';
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut size={12} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

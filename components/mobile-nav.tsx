'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sunrise, Newspaper, Gem, Lightbulb, TrendingUp,
  Twitter, Code2, BarChart2, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/',           label: 'Brief',    icon: Sunrise      },
  { href: '/prediction', label: 'Predict',  icon: BarChart2    },
  { href: '/x-events',   label: 'X Events', icon: Twitter      },
  { href: '/memes',      label: 'Memes',    icon: TrendingUp   },
  { href: '/nft-mints',  label: 'NFTs',     icon: Gem          },
  { href: '/news',       label: 'News',     icon: Newspaper    },
  { href: '/ideas',      label: 'Ideas',    icon: Lightbulb    },
  { href: '/dev-events', label: 'Dev',      icon: Code2        },
  { href: '/chat',       label: 'Chat',     icon: MessageSquare},
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur-md">
      <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 min-w-[60px] flex-shrink-0 transition-colors',
                active ? 'text-emerald-400' : 'text-muted-foreground',
              )}
            >
              <Icon size={18} className={cn('shrink-0', active && 'drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]')} />
              <span className={cn('text-[9px] font-medium leading-none', active ? 'text-emerald-400' : 'text-muted-foreground/70')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Newspaper, Gem, Lightbulb, TrendingUp,
  Twitter, Code2, BarChart2, MessageSquare, Sunrise,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/',               label: 'Morning Brief', icon: Sunrise },
  { href: '/news',           label: 'News',          icon: Newspaper },
  { href: '/nft-mints',      label: 'NFT Mints',     icon: Gem },
  { href: '/ideas',          label: 'Build Ideas',   icon: Lightbulb },
  { href: '/memes',          label: 'Meme Radar',    icon: TrendingUp },
  { href: '/x-events',       label: 'X Events',      icon: Twitter },
  { href: '/dev-events',     label: 'Dev Events',    icon: Code2 },
  { href: '/prediction',     label: 'Prediction',    icon: BarChart2 },
  { href: '/chat',           label: 'Chat',          icon: MessageSquare },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card px-3 py-4">
      <div className="mb-6 px-2">
        <span className="text-lg font-bold tracking-tight">Alpha Agent</span>
        <p className="text-xs text-muted-foreground">24/7 intel dashboard</p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
              pathname === href
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

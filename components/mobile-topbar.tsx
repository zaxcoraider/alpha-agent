'use client';

import { Menu, Radio } from 'lucide-react';
import { useNav } from '@/components/nav-context';

// Slim mobile-only top bar. Hamburger opens the sidebar drawer; the bottom
// MobileNav still handles primary tab switching.
export function MobileTopBar() {
  const { setMobileOpen } = useNav();

  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-border card-glass px-3 py-2.5">
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="text-muted-foreground hover:text-signal transition-colors"
      >
        <Menu size={20} />
      </button>

      <span className="font-bold text-[12px] tracking-[0.2em] text-foreground">PLANTIR</span>
      <span className="text-[10px] text-signal tracking-[0.18em] uppercase">Crypto Intel</span>

      <div className="ml-auto flex items-center gap-1.5">
        <Radio size={11} className="text-signal" />
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
        </span>
      </div>
    </header>
  );
}

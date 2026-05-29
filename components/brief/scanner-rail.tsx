'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  TrendingUp, Twitter, Gem, Newspaper, Code2, Lightbulb, BarChart2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type LayerId = 'memes' | 'x_events' | 'nft' | 'news' | 'dev_events' | 'ideas' | 'prediction';

type Layer = {
  id:    LayerId;
  label: string;
  href:  string;
  icon:  typeof TrendingUp;
  count: number | null; // null = not loaded
};

const LAYER_ORDER: Omit<Layer, 'count'>[] = [
  { id: 'memes',      label: 'Memes',     href: '/memes',      icon: TrendingUp },
  { id: 'x_events',   label: 'X Events',  href: '/x-events',   icon: Twitter    },
  { id: 'nft',        label: 'NFT Mints', href: '/nft-mints',  icon: Gem        },
  { id: 'news',       label: 'News',      href: '/news',       icon: Newspaper  },
  { id: 'dev_events', label: 'Dev',       href: '/dev-events', icon: Code2      },
  { id: 'ideas',      label: 'Ideas',     href: '/ideas',      icon: Lightbulb  },
  { id: 'prediction', label: 'Predict',   href: '/prediction', icon: BarChart2  },
];

type Props = {
  counts: Partial<Record<LayerId, number>>;
};

const LS_KEY = 'plantir.layers.enabled.v1';

export function ScannerRail({ counts }: Props) {
  // Per-layer enabled state, persisted in localStorage. Phase 1 = visual only
  // (the cron triggers don't honor this yet). Phase 2 will wire it through to
  // the Inngest function guards + scan-direct route.
  const [enabled, setEnabled] = useState<Record<LayerId, boolean>>(() => {
    const all: Record<LayerId, boolean> = {
      memes: true, x_events: true, nft: true, news: true,
      dev_events: true, ideas: true, prediction: true,
    };
    return all;
  });

  // Hydrate from localStorage after mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEnabled((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {/* ignore */}
  }, []);

  const toggle = (id: LayerId) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {/* ignore */}
      return next;
    });
  };

  const layers: Layer[] = LAYER_ORDER.map((l) => ({
    ...l,
    count: counts[l.id] ?? null,
  }));

  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="hud-panel rounded-lg p-2.5 self-start"
    >
      <div className="px-2 py-1.5 mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-muted-foreground">
          Layers
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          {Object.values(enabled).filter(Boolean).length}/{LAYER_ORDER.length}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {layers.map(({ id, label, href, icon: Icon, count }) => {
          const on = enabled[id];
          return (
            <div
              key={id}
              className={`group flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                on ? 'hover:bg-accent' : 'opacity-40 hover:opacity-60'
              }`}
            >
              {/* Toggle dot */}
              <button
                onClick={() => toggle(id)}
                aria-label={`Toggle ${label} scanner`}
                className="relative flex h-3 w-3 items-center justify-center shrink-0"
              >
                <span
                  className={`block h-2 w-2 rounded-full transition-all ${
                    on ? 'bg-signal' : 'bg-muted-foreground/40'
                  }`}
                  style={on ? { boxShadow: '0 0 8px hsl(var(--signal) / 0.6)' } : undefined}
                />
              </button>

              {/* Icon + label */}
              <Link
                href={href}
                className="flex-1 min-w-0 flex items-center gap-2"
              >
                <Icon size={13} className={on ? 'text-foreground' : 'text-muted-foreground'} />
                <span className={`text-xs ${on ? 'text-foreground' : 'text-muted-foreground'} truncate`}>
                  {label}
                </span>
              </Link>

              {/* Count */}
              <span className="font-mono text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {count === null ? '—' : String(count).padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 px-2 py-1.5 border-t border-border/60">
        <p className="text-[9px] leading-relaxed text-muted-foreground/70 tracking-wide">
          Click the dot to disable a layer.
          <span className="block text-muted-foreground/50 mt-0.5">
            Phase 1 — visual only.
          </span>
        </p>
      </div>
    </motion.aside>
  );
}

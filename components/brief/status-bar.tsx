'use client';

import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  lastUpdatedIso: string | null;
  activeLayers: number;
  totalLayers: number;
};

function relativeTime(iso: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function StatusBar({ lastUpdatedIso, activeLayers, totalLayers }: Props) {
  // Re-render every 30s so the relative timestamp stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Visual: render N segments, light up the first `activeLayers`.
  const segments = Array.from({ length: totalLayers });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card-glass sticky top-0 z-30 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-3 py-2 sm:px-4 -mx-3 sm:-mx-0"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-bold text-[11px] tracking-[0.2em] text-foreground">PLANTIR</span>
        <span className="hidden sm:inline text-[10px] text-muted-foreground tracking-widest">//</span>
        <span className="hidden sm:inline text-[10px] text-signal tracking-[0.18em] uppercase">Crypto Intel</span>
      </div>

      {/* Scanner pulse bar */}
      <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
        <span className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">scanning</span>
        <div className="flex items-center gap-[3px]">
          {segments.map((_, i) => (
            <span
              key={i}
              className={`block h-2.5 w-1 rounded-[1px] ${
                i < activeLayers ? 'bg-signal' : 'bg-muted'
              }`}
              style={i < activeLayers ? { boxShadow: '0 0 6px hsl(var(--signal) / 0.7)' } : undefined}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {activeLayers}/{totalLayers}
        </span>
      </div>

      {/* Last update */}
      <div className="flex items-center gap-1.5 shrink-0 text-[10px] tracking-wider uppercase">
        <span className="text-muted-foreground">last scan</span>
        <span className="font-mono text-foreground">{relativeTime(lastUpdatedIso)}</span>
      </div>

      {/* DGrid status */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        <Radio size={11} className="text-signal" />
        <span className="text-[10px] tracking-[0.18em] uppercase text-signal">DGrid live</span>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
        </span>
      </div>
    </motion.div>
  );
}

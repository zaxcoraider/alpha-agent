'use client';

import { motion } from 'framer-motion';

// Decorative radar pulse for the hero — pure SVG, GPU-cheap, runs without JS
// after mount. Three concentric arcs + a rotating sweep line.
export function ScanPulse({ size = 96 }: { size?: number }) {
  const r = size / 2;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{ width: size, height: size }}
      className="relative shrink-0"
      aria-hidden
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        {/* concentric rings */}
        <circle cx={r} cy={r} r={r * 0.85} fill="none" stroke="hsl(var(--signal))" strokeOpacity="0.2" strokeWidth="1" />
        <circle cx={r} cy={r} r={r * 0.6}  fill="none" stroke="hsl(var(--signal))" strokeOpacity="0.35" strokeWidth="1" />
        <circle cx={r} cy={r} r={r * 0.35} fill="none" stroke="hsl(var(--signal))" strokeOpacity="0.5" strokeWidth="1" />
        {/* center dot */}
        <circle cx={r} cy={r} r="3" fill="hsl(var(--signal))" />
      </svg>
      {/* rotating sweep line + soft glow */}
      <div className="absolute inset-0 animate-scan-sweep" style={{ transformOrigin: 'center' }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
          <defs>
            <linearGradient id="sweep" x1="50%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%"  stopColor="hsl(var(--signal))" stopOpacity="0" />
              <stop offset="80%" stopColor="hsl(var(--signal))" stopOpacity="0.6" />
              <stop offset="100%" stopColor="hsl(var(--signal))" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <line
            x1={r} y1={r}
            x2={size - 4} y2={r}
            stroke="url(#sweep)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </motion.div>
  );
}

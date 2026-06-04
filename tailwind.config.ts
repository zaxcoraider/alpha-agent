import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // HUD palette — registered as real colors so opacity modifiers work
        // (e.g. bg-signal/15, border-signal/40). Values track globals.css tokens.
        signal: {
          DEFAULT: 'hsl(var(--signal))',
          dim: 'hsl(var(--signal-dim))',
        },
        risk: {
          critical: 'hsl(var(--risk-critical))',
          high: 'hsl(var(--risk-high))',
          medium: 'hsl(var(--risk-medium))',
          low: 'hsl(var(--risk-low))',
        },
        chain: {
          sol: 'hsl(var(--chain-sol))',
          eth: 'hsl(var(--chain-eth))',
          base: 'hsl(var(--chain-base))',
          arbitrum: 'hsl(var(--chain-arbitrum))',
          polygon: 'hsl(var(--chain-polygon))',
          optimism: 'hsl(var(--chain-optimism))',
          bnb: 'hsl(var(--chain-bnb))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

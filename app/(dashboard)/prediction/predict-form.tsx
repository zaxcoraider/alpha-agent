'use client';

import { useState, useEffect, useRef } from 'react';
import { PredictionCard } from './prediction-card';
import { Search, Sparkles, X } from 'lucide-react';
import type { Prediction } from '@/lib/agents/prediction';

type State =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'polling'; jobId: string; question: string; isRealMarket: boolean }
  | { phase: 'done'; prediction: Prediction }
  | { phase: 'error'; message: string };

export function PredictForm() {
  const [input, setValue] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.phase !== 'polling') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const { jobId } = state;
    intervalRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/predict-status/${jobId}`);
        const data = await res.json() as { status: string; prediction?: Prediction };
        if (data.status === 'done' && data.prediction) {
          setState({ phase: 'done', prediction: data.prediction });
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setState({ phase: 'submitting' });
    try {
      const res  = await fetch('/api/predict-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json() as { jobId: string; question: string; isRealMarket: boolean };
      setState({ phase: 'polling', ...data });
    } catch {
      setState({ phase: 'error', message: 'Failed to start. Is Inngest running?' });
    }
  }

  function reset() { setValue(''); setState({ phase: 'idle' }); }

  const isLoading = state.phase === 'submitting' || state.phase === 'polling';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-emerald-500/3">
        <Sparkles size={14} className="text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider">
          Predict Anything
        </span>
        <span className="text-xs text-muted-foreground/50 ml-1">
          · type any question or paste a Polymarket URL
        </span>
      </div>

      <div className="p-4 space-y-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
            <input
              value={input}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Will BTC hit $200k by end of 2026?"
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 disabled:opacity-50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {state.phase === 'submitting' ? 'Starting…' : 'Analyze'}
          </button>
        </form>

        {/* Polling state */}
        {state.phase === 'polling' && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="text-xs text-muted-foreground min-w-0">
              <span className="text-foreground font-medium">Analyzing: </span>
              <span className="truncate">{state.question}</span>
              {state.isRealMarket && <span className="text-blue-400 ml-1">[real market]</span>}
              <span className="text-muted-foreground/50 ml-1">· 10 analysts running…</span>
            </div>
          </div>
        )}

        {/* Error */}
        {state.phase === 'error' && (
          <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2">
            {state.message}
          </p>
        )}

        {/* Result */}
        {state.phase === 'done' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-violet-400">Custom prediction result</span>
              <button
                onClick={reset}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={11} /> clear
              </button>
            </div>
            <PredictionCard p={state.prediction} />
          </div>
        )}
      </div>
    </div>
  );
}

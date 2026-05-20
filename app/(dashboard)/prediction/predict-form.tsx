'use client';

import { useState, useEffect, useRef } from 'react';
import { PredictionCard } from './prediction-card';
import type { Prediction } from '@/lib/agents/prediction';

type State =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'polling'; jobId: string; question: string; isRealMarket: boolean }
  | { phase: 'done'; prediction: Prediction }
  | { phase: 'error'; message: string };

export function PredictForm() {
  const [input, setValue]  = useState('');
  const [state, setState]  = useState<State>({ phase: 'idle' });
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll while in polling phase
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
      } catch {
        // keep polling — transient error
      }
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
      setState({ phase: 'error', message: 'Failed to start analysis. Is Inngest running?' });
    }
  }

  function reset() {
    setValue('');
    setState({ phase: 'idle' });
  }

  const isLoading = state.phase === 'submitting' || state.phase === 'polling';

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Predict anything
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask any question or paste a Polymarket URL…"
          disabled={isLoading}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {state.phase === 'submitting' ? 'Starting…' : 'Analyze'}
        </button>
      </form>

      {/* Polling state */}
      {state.phase === 'polling' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Analyzing <span className="text-foreground">{state.question}</span>
            {state.isRealMarket ? ' — real Polymarket market' : ' — custom question'}
            {' '}· 10 analysts running…
          </span>
        </div>
      )}

      {/* Error */}
      {state.phase === 'error' && (
        <p className="text-xs text-red-400">{state.message}</p>
      )}

      {/* Result */}
      {state.phase === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Custom prediction result</p>
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ✕ clear
            </button>
          </div>
          <PredictionCard p={state.prediction} />
        </div>
      )}
    </div>
  );
}

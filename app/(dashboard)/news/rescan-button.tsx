'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

type Status = 'idle' | 'running' | 'done' | 'error';

export function RescanButton({ agent }: { agent: string }) {
  const [status,  setStatus]  = useState<Status>('idle');
  const [saved,   setSaved]   = useState<number | null>(null);
  const [errMsg,  setErrMsg]  = useState('');

  async function handleClick() {
    setStatus('running');
    setSaved(null);
    setErrMsg('');

    try {
      const res = await fetch('/api/scan-direct', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent }),
      });

      const data = await res.json() as { ok: boolean; saved?: number; error?: string };

      if (!res.ok || !data.ok) {
        setErrMsg(data.error ?? 'Scan failed');
        setStatus('error');
        return;
      }

      setSaved(data.saved ?? 0);
      setStatus('done');

      // Auto-refresh the page so the new results show
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {status === 'done' && saved !== null && (
        <span className="text-xs text-emerald-400">
          ✓ {saved} found
        </span>
      )}
      {status === 'error' && (
        <span className="text-xs text-red-400 max-w-[160px] truncate" title={errMsg}>
          ✗ {errMsg || 'error'}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={status === 'running'}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw size={11} className={status === 'running' ? 'animate-spin' : ''} />
        {status === 'running' ? 'Scanning…' : 'Scan Now'}
      </button>
    </div>
  );
}

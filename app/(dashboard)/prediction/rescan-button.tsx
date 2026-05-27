'use client';

import { useState } from 'react';

export function RescanButton({ agent }: { agent: string }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'queued' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handleClick() {
    setLoading(true);
    setStatus('idle');
    setErrMsg('');
    try {
      const res = await fetch('/api/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrMsg(data.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      setStatus('queued');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'queued' && (
        <span className="text-xs text-emerald-400">Scan queued ✓</span>
      )}
      {status === 'error' && (
        <span className="text-xs text-red-400 max-w-[280px] truncate" title={errMsg}>
          ✗ {errMsg || 'Failed'}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Scanning…' : 'Scan Now'}
      </button>
    </div>
  );
}

'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const from         = searchParams.get('from') ?? '/';

  const [token,   setToken]   = useState('');
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: token.trim() }),
      });

      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        setError('Invalid access token. Try again.');
        setToken('');
      }
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-xl p-8 shadow-2xl">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <Shield size={26} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Alpha Agent</h1>
            <p className="text-sm text-white/40 mt-1">Enter your access token to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Access token"
                autoFocus
                disabled={loading}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/30 disabled:opacity-50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Verifying…</>
              ) : (
                'Enter Dashboard'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-white/20 mt-6">
            Private access only
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

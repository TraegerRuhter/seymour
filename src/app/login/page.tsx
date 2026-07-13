'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase';

export default function LoginPage() {
  const supabase = getSupabaseClient();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setStatus('sending');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setErrorMessage(error.message);
        setStatus('error');
      } else {
        setStatus('sent');
      }
    } catch {
      // Network-level failures (unreachable project, DNS, CORS) reject
      // instead of resolving to { error } — show the same error UI either way.
      setErrorMessage('Could not reach the server. Check your connection and try again.');
      setStatus('error');
    }
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-bold">Sync isn&apos;t set up</h1>
        <p className="text-sm text-charcoal/60">
          This deployment doesn&apos;t have accounts configured. Seymour still works fully without
          one — everything stays in this browser.
        </p>
        <Link
          href="/settings"
          className="inline-block text-sm font-medium text-terracotta hover:underline"
        >
          Back to Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="mt-1 text-charcoal/60">
          We&apos;ll email you a link — no password to remember. Signing in is optional; your data
          works fully without an account.
        </p>
      </header>

      {status === 'sent' ? (
        <p role="status" className="rounded-xl bg-olive/15 px-4 py-3 text-sm text-olive-dark">
          Check {email} for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-base"
            aria-label="Email address"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
          {status === 'error' && (
            <p role="alert" className="text-sm text-terracotta-dark">
              {errorMessage}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

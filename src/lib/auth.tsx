'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import { useAuthUserStore } from './stores';

interface AuthState {
  user: User | null;
  /** True until the initial session check resolves. Always false when accounts aren't configured. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  signOut: async () => {},
});

/**
 * Tracks the signed-in Supabase user, if accounts are configured at all. When
 * they're not (env vars unset), `user` stays null and `loading` resolves to
 * false immediately — every consumer treats that identically to "signed
 * out", so an account is never required to use Seymour.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      useAuthUserStore.getState().setUserId(data.user?.id ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      useAuthUserStore.getState().setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    useAuthUserStore.getState().setUserId(null);
  }

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

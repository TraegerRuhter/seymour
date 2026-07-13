'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null | undefined;

/**
 * Lazily-created singleton browser Supabase client. Returns null when the
 * project isn't configured (env vars unset), which the rest of the app
 * treats as a normal, fully-supported state — accounts and cross-device sync
 * are opt-in, never required to use Seymour.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  client =
    supabaseUrl && supabaseAnonKey ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null;
  return client;
}

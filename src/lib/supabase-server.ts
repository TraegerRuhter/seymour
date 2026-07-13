import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Server-side Supabase client for Server Components and Route Handlers,
 * backed by the request's cookies. `middleware.ts` builds its own client
 * instead — NextRequest/NextResponse use a different cookie API than
 * next/headers. Returns null when the project isn't configured, same as the
 * browser client in `supabase.ts`.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called during a Server Component render, where cookies are
          // read-only — middleware refreshes the session on every request
          // instead, so a failed write here is expected and harmless.
        }
      },
    },
  });
}

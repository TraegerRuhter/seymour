import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isSafeRedirectPath } from '@/lib/url-safety';

/** Exchanges a magic-link code for a session, then redirects home. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNext = searchParams.get('next');
  // `next` isn't currently linked to from anywhere in the app (the magic
  // link's redirect URL never sets it), but the route itself is a public
  // URL — validate it anyway rather than trusting whatever's in the query
  // string, so this stays safe if a future feature ever does pass one.
  const next = requestedNext && isSafeRedirectPath(requestedNext) ? requestedNext : '/settings';

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

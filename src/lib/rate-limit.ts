/**
 * Simple in-memory rate limiter shared by the API routes. Resets on cold
 * start and doesn't share counts across server instances — fine for a
 * personal, single-instance deployment, but the first thing to swap for a
 * durable shared store (e.g. Upstash Redis) once there's real concurrent
 * traffic across multiple instances.
 */

import { createServerSupabaseClient } from './supabase-server';

const windows = new Map<string, { count: number; resetAt: number }>();

/** Returns true when `key` has exceeded `limit` calls within the last minute. */
export function isRateLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

/** Best-effort client identifier from a request's forwarded-for header. */
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

/**
 * Identifies the caller for rate-limiting purposes: the signed-in user's id
 * when there is one, otherwise their IP. Prefixed (`user:`/`ip:`) so the two
 * namespaces can never collide.
 *
 * Keying by account instead of IP fixes two real problems IP-only limiting
 * has: multiple people on one household network sharing a single budget,
 * and one person getting a fresh budget for free just by switching networks.
 * Signing in is optional, so every caller of this must be fine with the IP
 * fallback — it's not a security boundary, just a fairer default identity.
 */
export async function requestIdentity(req: Request): Promise<string> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    if (user) return `user:${user.id}`;
  } catch {
    // Missing/invalid session, or Supabase unreachable — fall back to IP.
  }
  return `ip:${clientIp(req)}`;
}

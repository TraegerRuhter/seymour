/**
 * Rate limiter shared by the API routes. Backed by Upstash Redis
 * (KV_REST_API_URL/KV_REST_API_TOKEN — the names Vercel's Upstash
 * integration sets) when configured, so the limit is shared across every
 * server instance under real traffic. Falls back to an in-memory counter
 * when those env vars aren't set (local dev, or no Redis configured yet) —
 * that fallback resets on cold start and doesn't share counts across
 * instances, but it's a reasonable default for a single-instance deployment.
 */

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createServerSupabaseClient } from './supabase-server';

const windows = new Map<string, { count: number; resetAt: number }>();

/** The original in-memory implementation — used directly when Redis isn't configured, and as a fallback if Redis errors. */
function isRateLimitedInMemory(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
    : null;

// @upstash/ratelimit bakes the request cap into the instance at
// construction time, but different routes use different caps (30/min for
// parsing, 8/min for discovery) — memoize one instance per distinct limit
// rather than rebuilding one on every call.
const limiters = new Map<number, Ratelimit>();
function getLimiter(limit: number): Ratelimit {
  let limiter = limiters.get(limit);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, '1 m'),
      analytics: false,
      prefix: 'seymour-ratelimit',
    });
    limiters.set(limit, limiter);
  }
  return limiter;
}

/** Returns true when `key` has exceeded `limit` calls within the last minute. */
export async function isRateLimited(key: string, limit: number): Promise<boolean> {
  if (!redis) return isRateLimitedInMemory(key, limit);
  try {
    const { success } = await getLimiter(limit).limit(key);
    return !success;
  } catch {
    // Redis unreachable — fail open onto the in-memory fallback rather than
    // blocking every request because a dependency hiccuped. Same philosophy
    // as the rest of the app's optional integrations (Supabase, OpenAI):
    // degrade gracefully, never take down the core experience.
    return isRateLimitedInMemory(key, limit);
  }
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

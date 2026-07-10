/**
 * Simple in-memory rate limiter shared by the API routes. Resets on cold
 * start, which is fine for a personal single-user app.
 */

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

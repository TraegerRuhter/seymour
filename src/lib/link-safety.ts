/**
 * True for a URL whose scheme is http or https — the only schemes safe to
 * render as a link `href` for data that isn't fully trusted (a recipe's
 * `sourceUrl` can come from manual entry, a synced device, or a third-party
 * API, none of which are validated against a scheme allowlist upstream).
 * Without this, a `javascript:` value would be stored and clicked exactly
 * like a normal link. Client-safe (no Node built-ins), unlike the
 * SSRF-focused checks in `url-safety.ts`.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

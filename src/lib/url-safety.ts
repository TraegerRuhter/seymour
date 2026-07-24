import dns from 'node:dns';
import net from 'node:net';

/**
 * Guards the recipe-URL fetch against SSRF: a visitor can submit any URL to
 * `/api/parse`, which this server then fetches. Without this check, that URL
 * could point at an internal service (`http://localhost:5432/`) or a cloud
 * metadata endpoint (`http://169.254.169.254/latest/meta-data/`) instead of
 * a recipe site, turning the parser into a proxy for internal network
 * requests. This blocks the common case — a hostname/IP that's private,
 * loopback, link-local, or otherwise non-public — by checking every address
 * DNS resolves it to. It does not defend against DNS rebinding (re-resolving
 * to a different address between this check and the actual fetch); doing so
 * would mean pinning the validated IP for the connection itself, which is a
 * larger change than this app's threat model currently calls for.
 */

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast + reserved (224.0.0.0/4, 240.0.0.0/4)
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  // Link-local, fe80::/10: any address whose first hex group is fe80–febf.
  if (['fe8', 'fe9', 'fea', 'feb'].some((p) => lower.startsWith(p))) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local, fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded address too.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateOrReservedIpv4(mapped[1]);
  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateOrReservedIpv4(ip);
  if (version === 6) return isPrivateOrReservedIpv6(ip);
  return true; // not a recognizable IP — treat as unsafe rather than guess
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

type LookupFn = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultLookup: LookupFn = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Throws `UnsafeUrlError` if `hostname` is, or resolves to, a private/reserved address. */
export async function assertPublicHostname(hostname: string, lookup: LookupFn = defaultLookup) {
  const bare = hostname.toLowerCase();
  if (bare === 'localhost' || bare.endsWith('.localhost')) {
    throw new UnsafeUrlError('Local addresses aren’t allowed.');
  }
  // A literal IP in the URL skips DNS entirely, so check it directly too.
  if (net.isIP(bare) && isPrivateOrReservedIp(bare)) {
    throw new UnsafeUrlError('That address isn’t allowed.');
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new UnsafeUrlError('Could not resolve that address.');
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError('Could not resolve that address.');
  }
  if (addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new UnsafeUrlError('That address isn’t allowed.');
  }
}

/**
 * Guards a post-login redirect target against open-redirect tricks. A path
 * like `${origin}${next}` looks safely pinned to this site's own origin, but
 * isn't: with `next = "@evil.com"` the concatenated string parses as
 * `https://<this-origin>@evil.com` — valid URL syntax where the origin
 * becomes HTTP userinfo and `evil.com` becomes the actual host. Only a path
 * that's unambiguously relative to this origin (starts with exactly one
 * `/`, no scheme, no userinfo, no protocol-relative `//`) is safe to use.
 */
export function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path.includes('@') || path.includes('\\')) return false;
  return true;
}

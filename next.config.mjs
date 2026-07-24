/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Recipe images come from arbitrary external sites; we only store URLs.
    // Plain <img> tags are used throughout, so leave optimization off to avoid
    // routing third-party images through Vercel's optimizer.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        // Everything except the service worker, which needs to control its
        // own scope and shouldn't inherit a frame-ancestors restriction.
        source: '/((?!sw\\.js).*)',
        headers: [
          // Recipe titles/instructions/images come from third-party sites,
          // Spoonacular, and manual entry — this is a cheap second layer
          // behind the input-side XSS guards (sourceUrl scheme validation,
          // React's default escaping), not a replacement for them. A full
          // script-src CSP is deliberately out of scope here: Next's
          // hydration bootstrap and the pre-hydration theme-init script
          // need either a per-request nonce or 'unsafe-inline', and getting
          // that wrong silently breaks the whole app rather than failing
          // loudly — not a change to make without live verification.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing here is meant to be embedded in another site's frame.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Seymour never uses the camera, mic, or geolocation.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

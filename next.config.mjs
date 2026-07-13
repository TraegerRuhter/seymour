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
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    // Recipe images come from arbitrary external sites; we only store URLs.
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: '**' }],
  },
};

export default nextConfig;

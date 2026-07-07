/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Recipe images come from arbitrary external sites; we only store URLs.
    remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: '**' }],
  },
};

export default nextConfig;

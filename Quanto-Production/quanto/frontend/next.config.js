/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    cpus: 2,
  },
};

module.exports = nextConfig;

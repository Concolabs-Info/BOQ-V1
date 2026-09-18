const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    cpus: 2,
  },
  // Pin the workspace root to this directory. Without this, a stray
  // lockfile one level up (the repo root also has a package.json for
  // unrelated scripts) makes Turbopack infer the repo root as the
  // workspace root and load its .env too — which carries CLERK_JWT_KEY,
  // a var meant only for the Python backend's own token verification.
  // @clerk/nextjs's middleware picks that env var up automatically and
  // switches to networkless verification with it, which breaks
  // auth.protect() and causes an infinite /sign-in <-> /projects redirect loop.
  turbopack: {
    root: path.join(__dirname),
  },
  // Don't regenerate AGENTS.md/CLAUDE.md on every `next dev` run.
  agentRules: false,
};

module.exports = nextConfig;

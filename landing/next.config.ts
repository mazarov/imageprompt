import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const landingDir = import.meta.dirname;
const repoRoot = path.resolve(landingDir, "..");

// Локальный dev: один `.env.local` в корне репозитория (рядом с `landing/`).
loadEnvConfig(repoRoot);

/**
 * Standalone tracing root (must match Docker `COPY` + `CMD node server.js`):
 * - Default: monorepo parent if `../package-lock.json` exists, else `landing/` only (Docker context `landing/`).
 * - Override: `NEXT_STANDALONE_TRACING_ROOT` at **build** time — absolute path, or relative to this directory (e.g. `..` when parent lockfile is missing but you still want repo root).
 */
function resolveOutputFileTracingRoot(): string {
  const raw = process.env.NEXT_STANDALONE_TRACING_ROOT?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(landingDir, raw);
  }
  if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) {
    return repoRoot;
  }
  return landingDir;
}

const outputFileTracingRoot = resolveOutputFileTracingRoot();

/** Browser + middleware: expose Supabase URL/anon key under NEXT_PUBLIC_* even if only server-style names exist in `.env.local`. */
function resolvePublicSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SUPABASE_PUBLIC_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim();
}

function resolvePublicSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

const nextConfig: NextConfig = {
  outputFileTracingRoot,
  output: "standalone",
  env: {
    NEXT_PUBLIC_SUPABASE_URL: resolvePublicSupabaseUrl(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: resolvePublicSupabaseAnonKey(),
  },
  serverExternalPackages: ["@supabase/supabase-js"],
  webpack: (config, { dev, isServer }) => {
    // Dev + webpack: avoid missing `./vendor-chunks/@formatjs.js` when static-paths-worker loads before chunks finish writing (next-intl → @formatjs).
    if (dev && isServer) {
      config.optimization = { ...config.optimization, splitChunks: false };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
        permanent: true,
      },
      // defaultLocale=en uses no URL prefix (`localePrefix: as-needed`); avoid duplicate `/en` URLs
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
    ];
  },
  images: {
    qualities: [45, 60, 75],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.dockhost.net" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.yandex.net" },
    ],
  },
};

export default withNextIntl(nextConfig);

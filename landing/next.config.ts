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
  async headers() {
    // Baseline security headers applied to every response.
    const baseSecurityHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
    ];

    // Clickjacking protection — NOT applied to `/embed/*`, which is designed
    // to be embedded cross-origin (STV iframe widget).
    const frameProtectionHeaders = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ];

    return [
      {
        source: "/embed/:path*",
        headers: baseSecurityHeaders,
      },
      {
        // Everything except `/embed/*` gets frame protection too.
        source: "/((?!embed).*)",
        headers: [...baseSecurityHeaders, ...frameProtectionHeaders],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.png",
        permanent: true,
      },
      // defaultLocale=en uses no URL prefix (`localePrefix: as-needed`); avoid duplicate `/en` URLs
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
      { source: "/extension-stv", destination: "/ai-image-describer", permanent: true },
      { source: "/extension-stv/:path*", destination: "/ai-image-describer/:path*", permanent: true },
      { source: "/ai-image-describer/welcome", destination: "/welcome", permanent: true },
      { source: "/ai-image-describer/uninstall", destination: "/uninstall", permanent: true },
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

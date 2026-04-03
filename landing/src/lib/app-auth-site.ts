import type { NextRequest } from "next/server";

/** Public origin for OAuth redirect_uri and post-login redirects (proxies, local dev). */
export function getOAuthPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }

  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  return new URL(request.url).origin;
}

/** Relative path only; prevents open redirects. */
export function safeNextPath(next: string | null): string {
  if (!next || typeof next !== "string") return "/";
  const t = next.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/";
  return t.slice(0, 2048);
}

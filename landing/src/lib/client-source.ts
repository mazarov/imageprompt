import type { NextRequest } from "next/server";

export const CLIENT_SOURCES = [
  "site",
  "embed_stv",
  "extension_stv",
  "extension_lite",
  "promptshot",
  "unknown",
] as const;
export type ClientSource = (typeof CLIENT_SOURCES)[number];

function isClientSource(v: string): v is ClientSource {
  return (CLIENT_SOURCES as readonly string[]).includes(v);
}

/**
 * Normalized client attribution for analytics.
 * X-Client header wins; Origin header is the fallback.
 *
 * Canonical values: site | embed_stv | extension_stv | extension_lite | promptshot | unknown
 */
export function resolveClientSource(req: NextRequest): ClientSource {
  const explicit = (req.headers.get("x-client") || "").trim().toLowerCase();
  if (explicit && isClientSource(explicit)) return explicit;

  const origin = (req.headers.get("origin") || "").trim().toLowerCase();
  if (origin.startsWith("chrome-extension://")) {
    const liteId = (process.env.CHROME_EXTENSION_ID_LITE || "").trim();
    if (liteId && origin === `chrome-extension://${liteId}`) return "extension_lite";
    return "extension_stv";
  }
  if (origin.includes("promptshot.ru")) return "promptshot";
  if (origin) return "site";
  return "unknown";
}

import { createHash } from "node:crypto";

/** Client IP derived the same way as POST `/api/extension/analyze` rate limiting. */
export function extensionRateLimitParsedIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function extensionRateLimitUtcDayYYYYMMDD(now = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

/** SHA-256 hex of `${ip}:${YYYYMMDD_UTC}` — primary key input for `extension_rate_limit`. */
export function extensionRateLimitIpHash(ip: string, now = new Date()): string {
  const yyyymmdd = extensionRateLimitUtcDayYYYYMMDD(now);
  return createHash("sha256").update(`${ip}:${yyyymmdd}`).digest("hex");
}

/** Start of current UTC calendar day (ISO), passed to `extension_rate_limit_check_and_increment`. */
export function extensionRateLimitDayWindowStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

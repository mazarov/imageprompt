import { NextRequest, NextResponse } from "next/server";
import {
  extensionRateLimitDayWindowStartIso,
  extensionRateLimitIpHash,
  extensionRateLimitParsedIp,
  extensionRateLimitUtcDayYYYYMMDD,
} from "@/lib/extension-rate-limit-ip";

/**
 * Debug-only: returns the same `ip_hash` as POST `/api/extension/analyze` uses for rate limits.
 * Does not increment counters or touch Supabase.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const now = new Date();
  const ip = extensionRateLimitParsedIp(_req.headers);
  const ip_hash = extensionRateLimitIpHash(ip, now);
  const window_start = extensionRateLimitDayWindowStartIso(now);
  const utc_day_yyyymmdd = extensionRateLimitUtcDayYYYYMMDD(now);

  return NextResponse.json({ ip_hash, window_start, utc_day_yyyymmdd });
}

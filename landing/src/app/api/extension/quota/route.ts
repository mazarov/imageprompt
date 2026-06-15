import { NextRequest, NextResponse } from "next/server";
import {
  extensionRateLimitDayWindowStartIso,
  extensionRateLimitIpHash,
  extensionRateLimitParsedIp,
} from "@/lib/extension-rate-limit-ip";
import {
  extensionRateLimitUserBucketKey,
  getExtensionRateLimitPerDay,
} from "@/lib/extension-rate-limit";
import { createSupabaseServer } from "@/lib/supabase";
import { getSupabaseUserForApiRoute } from "@/lib/supabase-route-auth";

/**
 * GET /api/extension/quota
 * Returns the current rate-limit quota for the caller without incrementing.
 * Used by the extension popup to show remaining analyses on open.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = createSupabaseServer();
  const ip = extensionRateLimitParsedIp(req.headers);
  const ipHash = extensionRateLimitIpHash(ip);
  const windowStart = extensionRateLimitDayWindowStartIso();
  const max = await getExtensionRateLimitPerDay(supabase);

  const { user } = await getSupabaseUserForApiRoute(req);
  const userId = user?.id;
  const authenticated = Boolean(userId);
  const bucketKey = userId ? extensionRateLimitUserBucketKey(userId) : ipHash;

  try {
    const { data } = await supabase
      .from("extension_rate_limit")
      .select("count")
      .eq("ip_hash", bucketKey)
      .eq("window_start", windowStart)
      .maybeSingle();

    const count = Number(data?.count ?? 0) || 0;
    return NextResponse.json({
      remaining: Math.max(0, max - count),
      count,
      max,
      authenticated,
    });
  } catch (err) {
    console.error("[extension.quota] read failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ remaining: max, count: 0, max, authenticated });
  }
}

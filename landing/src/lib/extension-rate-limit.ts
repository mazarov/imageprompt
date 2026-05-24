import type { NextRequest } from "next/server";
import {
  extensionRateLimitDayWindowStartIso,
  extensionRateLimitIpHash,
  extensionRateLimitParsedIp,
} from "@/lib/extension-rate-limit-ip";
import { createSupabaseServer } from "@/lib/supabase";
import { getSupabaseUserForApiRoute } from "@/lib/supabase-route-auth";

const RATE_LIMIT_PER_DAY_DEFAULT = 30;

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

export type ExtensionRateLimitCheckResult = {
  allowed: boolean;
  count: number;
  max: number;
  authenticated: boolean;
  bucket: "ip" | "user";
  ipHash: string;
  windowStart: string;
};

export function extensionRateLimitUserBucketKey(userId: string): string {
  return `user:${userId}`;
}

export async function getExtensionRateLimitPerDay(
  supabase: SupabaseServer,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("aiid_app_config")
      .select("value")
      .eq("key", "extension_rate_limit_per_day")
      .maybeSingle();

    if (error) {
      console.warn("[extension.rate-limit] aiid_app_config read failed", {
        message: error.message,
      });
      return RATE_LIMIT_PER_DAY_DEFAULT;
    }

    const parsed = parseInt(String(data?.value ?? ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch (err) {
    console.warn("[extension.rate-limit] aiid_app_config read threw", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return RATE_LIMIT_PER_DAY_DEFAULT;
}

export async function mergeExtensionIpLimitIntoUser(params: {
  supabase: SupabaseServer;
  userId: string;
  ipHash: string;
  windowStart: string;
}): Promise<void> {
  try {
    const { error } = await params.supabase.rpc(
      "extension_rate_limit_merge_ip_to_user",
      {
        p_user_id: params.userId,
        p_ip_hash: params.ipHash,
        p_window_start: params.windowStart,
      },
    );

    if (error) {
      console.error("[extension.rate-limit] merge_rpc_error", {
        message: error.message,
        userId: params.userId,
      });
    }
  } catch (err) {
    console.error("[extension.rate-limit] merge_threw", {
      message: err instanceof Error ? err.message : String(err),
      userId: params.userId,
    });
  }
}

export async function mergeExtensionIpLimitForRequest(
  req: NextRequest,
  userId: string,
  supabase: SupabaseServer = createSupabaseServer(),
): Promise<void> {
  const ip = extensionRateLimitParsedIp(req.headers);
  const ipHash = extensionRateLimitIpHash(ip);
  const windowStart = extensionRateLimitDayWindowStartIso();
  await mergeExtensionIpLimitIntoUser({ supabase, userId, ipHash, windowStart });
}

export async function checkAndIncrementExtensionLimit(
  req: NextRequest,
  supabase: SupabaseServer,
): Promise<ExtensionRateLimitCheckResult | null> {
  const ip = extensionRateLimitParsedIp(req.headers);
  const ipHash = extensionRateLimitIpHash(ip);
  const windowStart = extensionRateLimitDayWindowStartIso();
  const max = await getExtensionRateLimitPerDay(supabase);

  const { user } = await getSupabaseUserForApiRoute(req);
  const userId = user?.id;
  const authenticated = Boolean(userId);
  const bucketKey = userId ? extensionRateLimitUserBucketKey(userId) : ipHash;

  if (userId) {
    await mergeExtensionIpLimitIntoUser({ supabase, userId, ipHash, windowStart });
  }

  try {
    const { data, error } = await supabase.rpc(
      "extension_rate_limit_check_and_increment",
      {
        p_ip_hash: bucketKey,
        p_window_start: windowStart,
        p_max_count: max,
      },
    );

    if (error) {
      console.error("[extension.rate-limit] check_rpc_error", {
        message: error.message,
        authenticated,
      });
      return null;
    }

    const row = data as { allowed?: unknown; count?: unknown } | null;
    return {
      allowed: row?.allowed === true,
      count: Number(row?.count ?? 0) || 0,
      max,
      authenticated,
      bucket: authenticated ? "user" : "ip",
      ipHash,
      windowStart,
    };
  } catch (err) {
    console.error("[extension.rate-limit] check_threw", {
      message: err instanceof Error ? err.message : String(err),
      authenticated,
    });
    return null;
  }
}

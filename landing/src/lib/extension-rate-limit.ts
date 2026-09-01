import type { NextRequest } from "next/server";
import {
  extensionRateLimitDayWindowStartIso,
  extensionRateLimitIpHash,
  extensionRateLimitParsedIp,
} from "@/lib/extension-rate-limit-ip";
import { extensionLog } from "@/lib/extension-pipeline-log";
import { createSupabaseServer } from "@/lib/supabase";
import { getSupabaseUserForApiRoute } from "@/lib/supabase-route-auth";

/** Fallback if `aiid_app_config.extension_rate_limit_per_day` is missing. */
export const RATE_LIMIT_PER_DAY_DEFAULT = 15;
const CONFIG_CACHE_TTL_MS = parseConfigCacheTtlMs();

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

type ConfigCacheEntry = {
  value: number;
  expiresAt: number;
};

let configCache: ConfigCacheEntry | null = null;

function parseConfigCacheTtlMs(): number {
  const raw = parseInt(process.env.EXTENSION_RATE_LIMIT_CONFIG_TTL_MS ?? "120000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
}

export type ExtensionRateLimitCheckResult = {
  allowed: boolean;
  count: number;
  pending: number;
  max: number;
  authenticated: boolean;
  bucket: "ip" | "user";
  ipHash: string;
  windowStart: string;
  userId: string | null;
};

export type ExtensionRateLimitContext = {
  ipHash: string;
  windowStart: string;
  max: number;
  authenticated: boolean;
  bucketKey: string;
  userId: string | null;
  bucket: "ip" | "user";
};

export type ExtensionRateLimitSession = {
  ctx: ExtensionRateLimitContext;
  check: ExtensionRateLimitCheckResult;
};

export function extensionRateLimitUserBucketKey(userId: string): string {
  return `user:${userId}`;
}

export function extensionRateLimitEffectiveUsage(check: Pick<ExtensionRateLimitCheckResult, "count" | "pending">): number {
  return check.count + check.pending;
}

export async function getExtensionRateLimitPerDay(
  supabase: SupabaseServer,
): Promise<number> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) {
    return configCache.value;
  }

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
      return configCache?.value ?? RATE_LIMIT_PER_DAY_DEFAULT;
    }

    const parsed = parseInt(String(data?.value ?? ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      configCache = { value: parsed, expiresAt: now + CONFIG_CACHE_TTL_MS };
      return parsed;
    }
  } catch (err) {
    console.warn("[extension.rate-limit] aiid_app_config read threw", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return configCache?.value ?? RATE_LIMIT_PER_DAY_DEFAULT;
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

export type ExtensionRateLimitSnapshot = {
  count: number;
  pending: number;
  max: number;
  remaining: number;
  authenticated: boolean;
  bucket: "ip" | "user";
  ipHash: string;
  windowStart: string;
  userId: string | null;
};

async function resolveExtensionRateLimitContext(
  req: NextRequest,
  supabase: SupabaseServer,
): Promise<ExtensionRateLimitContext> {
  const ip = extensionRateLimitParsedIp(req.headers);
  const ipHash = extensionRateLimitIpHash(ip);
  const windowStart = extensionRateLimitDayWindowStartIso();
  const max = await getExtensionRateLimitPerDay(supabase);

  const { user } = await getSupabaseUserForApiRoute(req);
  const userId = user?.id ?? null;
  const authenticated = Boolean(userId);
  const bucketKey = userId ? extensionRateLimitUserBucketKey(userId) : ipHash;

  if (userId) {
    await mergeExtensionIpLimitIntoUser({ supabase, userId, ipHash, windowStart });
  }

  return {
    ipHash,
    windowStart,
    max,
    authenticated,
    bucketKey,
    userId,
    bucket: authenticated ? "user" : "ip",
  };
}

type ExtensionRateLimitBucketState = {
  count: number;
  pending: number;
};

async function readExtensionRateLimitBucket(
  supabase: SupabaseServer,
  bucketKey: string,
  windowStart: string,
): Promise<ExtensionRateLimitBucketState> {
  const { data } = await supabase
    .from("extension_rate_limit")
    .select("count, pending")
    .eq("ip_hash", bucketKey)
    .eq("window_start", windowStart)
    .maybeSingle();

  return {
    count: Number(data?.count ?? 0) || 0,
    pending: Number(data?.pending ?? 0) || 0,
  };
}

type RateLimitRpcRow = {
  allowed?: unknown;
  count?: unknown;
  pending?: unknown;
};

function parseRateLimitRpcRow(
  ctx: ExtensionRateLimitContext,
  row: RateLimitRpcRow | null,
): ExtensionRateLimitCheckResult {
  const count = Number(row?.count ?? 0) || 0;
  const pending = Number(row?.pending ?? 0) || 0;
  return {
    allowed: row?.allowed === true,
    count,
    pending,
    max: ctx.max,
    authenticated: ctx.authenticated,
    bucket: ctx.bucket,
    ipHash: ctx.ipHash,
    windowStart: ctx.windowStart,
    userId: ctx.userId,
  };
}

function toExtensionRateLimitCheckResult(
  ctx: ExtensionRateLimitContext,
  bucket: ExtensionRateLimitBucketState,
  allowed: boolean,
): ExtensionRateLimitCheckResult {
  return {
    allowed,
    count: bucket.count,
    pending: bucket.pending,
    max: ctx.max,
    authenticated: ctx.authenticated,
    bucket: ctx.bucket,
    ipHash: ctx.ipHash,
    windowStart: ctx.windowStart,
    userId: ctx.userId,
  };
}

function logFailOpen(phase: string, message: string, fields: Record<string, unknown> = {}): void {
  extensionLog("rate_limit.fail_open", { phase, message, ...fields });
}

/** Read-only preflight: does not reserve or increment the daily counter. */
export async function checkExtensionRateLimit(
  req: NextRequest,
  supabase: SupabaseServer,
): Promise<ExtensionRateLimitCheckResult | null> {
  const session = await beginExtensionRateLimitSession(req, supabase);
  return session?.check ?? null;
}

/** Begin a rate-limit session (single auth/config/merge resolve per request). */
export async function beginExtensionRateLimitSession(
  req: NextRequest,
  supabase: SupabaseServer,
): Promise<ExtensionRateLimitSession | null> {
  try {
    const ctx = await resolveExtensionRateLimitContext(req, supabase);
    const bucket = await readExtensionRateLimitBucket(supabase, ctx.bucketKey, ctx.windowStart);
    const effective = bucket.count + bucket.pending;
    return {
      ctx,
      check: toExtensionRateLimitCheckResult(ctx, bucket, effective < ctx.max),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extension.rate-limit] check_threw", { message });
    logFailOpen("preflight", message);
    return null;
  }
}

/** Reserve one in-flight slot before calling Gemini. */
export async function reserveExtensionRateLimitForSession(
  supabase: SupabaseServer,
  session: ExtensionRateLimitSession,
): Promise<ExtensionRateLimitCheckResult | null> {
  try {
    const { ctx } = session;
    const { data, error } = await supabase.rpc("extension_rate_limit_reserve_if_allowed", {
      p_ip_hash: ctx.bucketKey,
      p_window_start: ctx.windowStart,
      p_max_count: ctx.max,
    });

    if (error) {
      console.error("[extension.rate-limit] reserve_rpc_error", {
        message: error.message,
        authenticated: ctx.authenticated,
      });
      logFailOpen("reserve", error.message, { authenticated: ctx.authenticated });
      return null;
    }

    return parseRateLimitRpcRow(ctx, data as RateLimitRpcRow | null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extension.rate-limit] reserve_threw", { message });
    logFailOpen("reserve", message);
    return null;
  }
}

/** Confirm reservation after upstream success (pending → count). */
export async function confirmExtensionRateLimitForSession(
  supabase: SupabaseServer,
  session: ExtensionRateLimitSession,
): Promise<ExtensionRateLimitCheckResult | null> {
  try {
    const { ctx } = session;
    const { data, error } = await supabase.rpc("extension_rate_limit_confirm_reservation", {
      p_ip_hash: ctx.bucketKey,
      p_window_start: ctx.windowStart,
    });

    if (error) {
      console.error("[extension.rate-limit] confirm_rpc_error", {
        message: error.message,
        authenticated: ctx.authenticated,
      });
      logFailOpen("confirm", error.message, { authenticated: ctx.authenticated });
      return null;
    }

    return parseRateLimitRpcRow(ctx, data as RateLimitRpcRow | null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extension.rate-limit] confirm_threw", { message });
    logFailOpen("confirm", message);
    return null;
  }
}

/** Release reservation after upstream failure (pending only). */
export async function releaseExtensionRateLimitForSession(
  supabase: SupabaseServer,
  session: ExtensionRateLimitSession,
): Promise<ExtensionRateLimitCheckResult | null> {
  try {
    const { ctx } = session;
    const { data, error } = await supabase.rpc("extension_rate_limit_release_reservation", {
      p_ip_hash: ctx.bucketKey,
      p_window_start: ctx.windowStart,
    });

    if (error) {
      console.error("[extension.rate-limit] release_rpc_error", {
        message: error.message,
        authenticated: ctx.authenticated,
      });
      logFailOpen("release", error.message, { authenticated: ctx.authenticated });
      return null;
    }

    return parseRateLimitRpcRow(ctx, data as RateLimitRpcRow | null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extension.rate-limit] release_threw", { message });
    logFailOpen("release", message);
    return null;
  }
}

/** Read-only quota snapshot; mirrors analyze merge logic without reserving. */
export async function getExtensionRateLimitSnapshot(
  req: NextRequest,
  supabase: SupabaseServer,
): Promise<ExtensionRateLimitSnapshot> {
  const session = await beginExtensionRateLimitSession(req, supabase);
  if (!session) {
    const max = await getExtensionRateLimitPerDay(supabase);
    return {
      count: 0,
      pending: 0,
      max,
      remaining: max,
      authenticated: false,
      bucket: "ip",
      ipHash: extensionRateLimitIpHash(extensionRateLimitParsedIp(req.headers)),
      windowStart: extensionRateLimitDayWindowStartIso(),
      userId: null,
    };
  }

  const { check } = session;
  const effective = extensionRateLimitEffectiveUsage(check);
  return {
    count: check.count,
    pending: check.pending,
    max: check.max,
    remaining: Math.max(0, check.max - effective),
    authenticated: check.authenticated,
    bucket: check.bucket,
    ipHash: check.ipHash,
    windowStart: check.windowStart,
    userId: check.userId,
  };
}

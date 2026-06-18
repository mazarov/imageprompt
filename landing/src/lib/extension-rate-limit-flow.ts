import type { NextRequest } from "next/server";
import { recordAnalyzeEvent } from "@/lib/analyze-events";
import { resolveClientSource } from "@/lib/client-source";
import type {
  ExtensionRateLimitCheckResult,
  ExtensionRateLimitSession,
} from "@/lib/extension-rate-limit";
import {
  beginExtensionRateLimitSession,
  confirmExtensionRateLimitForSession,
  extensionRateLimitEffectiveUsage,
  releaseExtensionRateLimitForSession,
  reserveExtensionRateLimitForSession,
} from "@/lib/extension-rate-limit";
import { extensionLog } from "@/lib/extension-pipeline-log";
import type { createSupabaseServer } from "@/lib/supabase";

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

export function extensionRateLimit429Body(rateLimit: ExtensionRateLimitCheckResult) {
  const effective = extensionRateLimitEffectiveUsage(rateLimit);
  return {
    error: "rate_limited" as const,
    message: "Daily limit reached. Try again in 24 hours.",
    limit_count: effective,
    limit_max: rateLimit.max,
    authenticated: rateLimit.authenticated,
    auth_required: !rateLimit.authenticated,
  };
}

export function extensionRateLimitQuotaFields(rateLimit: ExtensionRateLimitCheckResult | null) {
  if (!rateLimit) return {};
  const effective = extensionRateLimitEffectiveUsage(rateLimit);
  return {
    remaining: Math.max(0, rateLimit.max - effective),
    count: rateLimit.count,
    pending: rateLimit.pending,
    max: rateLimit.max,
  };
}

export function recordExtensionRateLimitEvent(
  supabase: SupabaseServer,
  req: NextRequest,
  endpoint: "analyze" | "remix",
  rateLimit: ExtensionRateLimitCheckResult | null,
  allowed: boolean,
): void {
  if (!rateLimit) return;
  const clientSource = resolveClientSource(req, {
    authenticated: rateLimit.authenticated,
  });
  recordAnalyzeEvent(supabase, {
    endpoint,
    clientSource,
    ipHash: rateLimit.ipHash,
    userId: rateLimit.userId,
    allowed,
    requestOrigin: req.headers.get("origin"),
  });
}

function logPreflight(
  endpoint: "analyze" | "remix",
  check: ExtensionRateLimitCheckResult,
): void {
  extensionLog("rate_limit.preflight", {
    endpoint,
    allowed: check.allowed,
    count: check.count,
    pending: check.pending,
    max: check.max,
    bucket: check.bucket,
  });
}

function logReserve(check: ExtensionRateLimitCheckResult): void {
  extensionLog("rate_limit.reserve", {
    allowed: check.allowed,
    count: check.count,
    pending: check.pending,
  });
}

function logConfirmOrRelease(
  step: "rate_limit.confirm" | "rate_limit.release",
  check: ExtensionRateLimitCheckResult | null,
): void {
  if (!check) return;
  extensionLog(step, {
    allowed: check.allowed,
    count: check.count,
    pending: check.pending,
  });
}

export async function beginExtensionRateLimit(
  req: NextRequest,
  supabase: SupabaseServer,
  endpoint: "analyze" | "remix",
): Promise<ExtensionRateLimitSession | null> {
  const session = await beginExtensionRateLimitSession(req, supabase);
  if (session) {
    logPreflight(endpoint, session.check);
  }
  return session;
}

export async function reserveExtensionRateLimit(
  supabase: SupabaseServer,
  session: ExtensionRateLimitSession,
): Promise<ExtensionRateLimitCheckResult | null> {
  const result = await reserveExtensionRateLimitForSession(supabase, session);
  if (result) {
    logReserve(result);
  }
  return result;
}

export async function confirmExtensionRateLimitOnSuccess(
  supabase: SupabaseServer,
  session: ExtensionRateLimitSession,
): Promise<ExtensionRateLimitCheckResult | null> {
  const result = await confirmExtensionRateLimitForSession(supabase, session);
  logConfirmOrRelease("rate_limit.confirm", result);
  return result;
}

export async function releaseExtensionRateLimitOnFailure(
  supabase: SupabaseServer,
  session: ExtensionRateLimitSession,
): Promise<ExtensionRateLimitCheckResult | null> {
  const result = await releaseExtensionRateLimitForSession(supabase, session);
  logConfirmOrRelease("rate_limit.release", result);
  return result;
}

export function extensionRateLimitCheckFromSession(
  session: ExtensionRateLimitSession | null,
  override?: ExtensionRateLimitCheckResult | null,
): ExtensionRateLimitCheckResult | null {
  return override ?? session?.check ?? null;
}

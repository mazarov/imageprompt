import type { NextRequest } from "next/server";
import { getSupabaseUserForApiRoute } from "@/lib/supabase-route-auth";

/** Comma/semicolon-separated allowlist, e.g. you@example.com;other@example.com */
export function getAnalyticsAdminEmails(): string[] {
  const raw = process.env.ANALYTICS_ADMIN_EMAILS || "";
  return raw
    .split(/[,;\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function isAnalyticsAdminEmail(email: string | null | undefined): boolean {
  const allow = getAnalyticsAdminEmails();
  if (allow.length === 0) return false;
  const normalized = (email || "").trim().toLowerCase();
  return Boolean(normalized && allow.includes(normalized));
}

export async function requireAnalyticsAdmin(request: NextRequest): Promise<
  | { ok: true; email: string; userId: string }
  | { ok: false; status: 401 | 403; error: string }
> {
  const { user } = await getSupabaseUserForApiRoute(request);
  if (!user) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const allow = getAnalyticsAdminEmails();
  if (allow.length === 0) {
    return { ok: false, status: 403, error: "analytics_admin_not_configured" };
  }

  if (!isAnalyticsAdminEmail(user.email)) {
    return { ok: false, status: 403, error: "forbidden" };
  }

  return { ok: true, email: user.email!.trim().toLowerCase(), userId: user.id };
}

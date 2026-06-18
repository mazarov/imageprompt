import { NextRequest, NextResponse } from "next/server";
import { getExtensionRateLimitSnapshot } from "@/lib/extension-rate-limit";
import { createSupabaseServer } from "@/lib/supabase";

/**
 * GET /api/extension/quota
 * Returns the current rate-limit quota for the caller without incrementing.
 * Used by the extension popup to show remaining analyses on open.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = createSupabaseServer();
  const snapshot = await getExtensionRateLimitSnapshot(req, supabase);

  return NextResponse.json({
    remaining: snapshot.remaining,
    count: snapshot.count,
    pending: snapshot.pending,
    max: snapshot.max,
    authenticated: snapshot.authenticated,
  });
}

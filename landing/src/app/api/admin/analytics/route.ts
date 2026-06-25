import { NextRequest, NextResponse } from "next/server";
import { fetchAnalyticsDashboard } from "@/lib/analytics-data";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseDaysParam(raw: string | null): number {
  const n = Number(raw ?? 30);
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(1, Math.floor(n)));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const days = parseDaysParam(req.nextUrl.searchParams.get("days"));

  try {
    const data = await fetchAnalyticsDashboard(days);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin.analytics] fetch failed", { message });
    return NextResponse.json(
      {
        error: "analytics_fetch_failed",
        message:
          "Could not load analytics views. Apply SQL migrations 14-01..14-05 in Supabase first.",
      },
      { status: 500 },
    );
  }
}

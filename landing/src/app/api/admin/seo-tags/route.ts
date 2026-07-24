import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import { classifySeoTagsForPublish } from "@/lib/seo-tags-classify";
import { createSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const startedAt = Date.now();

  try {
    const body = (await req.json()) as {
      title?: string | null;
      promptTexts?: unknown;
    };

    const title = typeof body.title === "string" ? body.title : body.title === null ? null : null;
    const promptTexts = Array.isArray(body.promptTexts)
      ? body.promptTexts
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (promptTexts.length === 0) {
      return NextResponse.json({ error: "promptTexts_required" }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    const classified = await classifySeoTagsForPublish(supabase, title, promptTexts);

    console.log("[admin.seo-tags] classify", {
      adminEmail: gate.email,
      promptCount: promptTexts.length,
      source: classified.source,
      viaProxy: classified.viaProxy,
      seo_readiness_score: classified.seo_readiness_score,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      seo_tags: classified.seo_tags,
      seo_readiness_score: classified.seo_readiness_score,
      source: classified.source,
    });
  } catch (err) {
    console.error("[admin.seo-tags] error", {
      adminEmail: gate.email,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "classify_failed" }, { status: 500 });
  }
}

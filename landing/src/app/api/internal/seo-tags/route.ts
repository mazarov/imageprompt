import { NextRequest, NextResponse } from "next/server";
import {
  classifySeoTagsForPublish,
  SeoTagsClassifyError,
} from "@/lib/seo-tags-classify";
import { createSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Internal SEO tag classification for aiphoto / promptshot (server-to-server).
 * Body: { title?: string | null, promptTexts: string[] }
 *
 * Auth: none for now (TODO: INTERNAL_SEO_TAGS_SECRET when ready).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as {
      title?: string | null;
      promptTexts?: unknown;
    };

    const title = typeof body.title === "string" ? body.title : null;
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

    console.log("[internal.seo-tags] classify", {
      promptCount: promptTexts.length,
      source: classified.source,
      viaProxy: classified.viaProxy,
      seo_readiness_score: classified.seo_readiness_score,
      newTagsCount: classified.new_tags.length,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      seo_tags: classified.seo_tags,
      seo_readiness_score: classified.seo_readiness_score,
      source: classified.source,
      viaProxy: classified.viaProxy,
      new_tags: classified.new_tags,
    });
  } catch (err) {
    console.error("[internal.seo-tags] error", {
      code: err instanceof SeoTagsClassifyError ? err.code : "unknown",
      message: err instanceof Error ? err.message : String(err),
      details: err instanceof SeoTagsClassifyError ? err.details : undefined,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "classify_failed",
        code: err instanceof SeoTagsClassifyError ? err.code : "classify_failed",
        message: err instanceof Error ? err.message : "SEO tagging failed",
      },
      {
        status:
          err instanceof SeoTagsClassifyError && err.code === "prompt_required" ? 400 : 502,
      },
    );
  }
}

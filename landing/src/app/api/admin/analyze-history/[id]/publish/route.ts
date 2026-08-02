import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import { ANALYZE_HISTORY_BUCKET } from "@/lib/analyze-history";
import { toPromptshotCardUrl } from "@/lib/promptshot-public-url";
import {
  classifySeoTagsForPublish,
  SeoTagsClassifyError,
} from "@/lib/seo-tags-classify";
import { createSupabaseServer } from "@/lib/supabase";
import { createUgcCardForAnalyzeHistory } from "@/lib/web-ugc-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PUBLIC_RESULTS_BUCKET = "web-generation-results";

async function maybeRevalidatePromptshot(slug: string): Promise<void> {
  const url = (process.env.PROMPTSHOT_REVALIDATE_URL || "").trim();
  const secret = (process.env.PROMPTSHOT_REVALIDATE_SECRET || "").trim();
  if (!url || !secret) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ slug, paths: [`/p/${slug}`, "/sitemap.xml"] }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[admin.analyze.publish] promptshot revalidate failed", {
      slug,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const startedAt = Date.now();
  const { id: analyzeHistoryId } = await params;
  if (!analyzeHistoryId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServer();
    const { data: history, error: historyError } = await supabase
      .from("analyze_history")
      .select("id,prompt,image_path,image_mime,ugc_card_id")
      .eq("id", analyzeHistoryId)
      .maybeSingle();

    if (historyError) {
      console.error("[admin.analyze.publish] history fetch failed", {
        analyzeHistoryId,
        message: historyError.message,
      });
      return NextResponse.json(
        {
          error: "analyze_history_fetch_failed",
          message:
            "Could not load publication fields. Apply SQL migration docs/sql/14-12-analyze-history-publishing.sql first.",
        },
        { status: 500 },
      );
    }
    if (!history) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const promptText = String(history.prompt || "").trim();
    const imagePath = (history.image_path as string | null) ?? null;
    if (!promptText || !imagePath) {
      return NextResponse.json({ error: "analysis_content_missing" }, { status: 409 });
    }

    let cardId = (history.ugc_card_id as string | null) ?? null;
    let slug: string | null = null;

    if (cardId) {
      const { data: existingCard } = await supabase
        .from("prompt_cards")
        .select("id,slug,is_published")
        .eq("id", cardId)
        .maybeSingle();

      if (existingCard?.id) {
        slug = (existingCard.slug as string | null) ?? null;
        if (existingCard.is_published) {
          return NextResponse.json({
            ok: true,
            alreadyPublished: true,
            cardId,
            slug,
            cardUrl: slug ? toPromptshotCardUrl(slug) : null,
            seo_readiness_score: null,
          });
        }
      } else {
        await supabase
          .from("analyze_history")
          .update({ ugc_card_id: null })
          .eq("id", analyzeHistoryId)
          .eq("ugc_card_id", cardId);
        cardId = null;
      }
    }

    if (!cardId) {
      const { data: sourceImage, error: downloadError } = await supabase.storage
        .from(ANALYZE_HISTORY_BUCKET)
        .download(imagePath);
      if (downloadError || !sourceImage) {
        console.error("[admin.analyze.publish] source image download failed", {
          analyzeHistoryId,
          imagePath,
          message: downloadError?.message ?? "empty_download",
        });
        return NextResponse.json({ error: "source_image_unavailable" }, { status: 409 });
      }

      const sourceFilename = imagePath.split("/").pop() || `${analyzeHistoryId}.jpg`;
      const publicPath = `analyze-publications/${analyzeHistoryId}/${sourceFilename}`;
      const contentType =
        (history.image_mime as string | null) || sourceImage.type || "image/jpeg";
      const { error: uploadError } = await supabase.storage
        .from(PUBLIC_RESULTS_BUCKET)
        .upload(publicPath, sourceImage, {
          contentType,
          upsert: true,
        });
      if (uploadError) {
        console.error("[admin.analyze.publish] public image upload failed", {
          analyzeHistoryId,
          publicPath,
          message: uploadError.message,
        });
        return NextResponse.json({ error: "public_image_upload_failed" }, { status: 500 });
      }

      const ugc = await createUgcCardForAnalyzeHistory(supabase, {
        analyzeHistoryId,
        promptText,
        resultBucket: PUBLIC_RESULTS_BUCKET,
        resultPath: publicPath,
      });
      if (!ugc?.cardId) {
        return NextResponse.json({ error: "card_create_failed" }, { status: 500 });
      }
      cardId = ugc.cardId;
      slug = ugc.slug;
    }

    const { data: card, error: cardError } = await supabase
      .from("prompt_cards")
      .select("id,slug,title_ru")
      .eq("id", cardId)
      .single();
    if (cardError || !card) {
      return NextResponse.json({ error: "card_not_found" }, { status: 404 });
    }
    slug = (card.slug as string | null) ?? slug;

    let classified;
    try {
      classified = await classifySeoTagsForPublish(
        supabase,
        (card.title_ru as string | null) ?? null,
        [promptText],
      );
    } catch (tagError) {
      return NextResponse.json(
        {
          error: "tagging_failed",
          code: tagError instanceof SeoTagsClassifyError ? tagError.code : "classify_failed",
          message: tagError instanceof Error ? tagError.message : "SEO tagging failed",
        },
        { status: 502 },
      );
    }

    const { error: publishError } = await supabase
      .from("prompt_cards")
      .update({
        is_published: true,
        seo_tags: classified.seo_tags,
        seo_readiness_score: classified.seo_readiness_score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);
    if (publishError) {
      return NextResponse.json({ error: publishError.message }, { status: 500 });
    }

    if (slug) {
      revalidatePath(`/p/${slug}`);
      revalidatePath("/sitemap.xml");
      void maybeRevalidatePromptshot(slug);
    }

    console.log("[admin.analyze.publish] published", {
      adminEmail: gate.email,
      analyzeHistoryId,
      cardId,
      slug,
      seo_readiness_score: classified.seo_readiness_score,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      alreadyPublished: false,
      cardId,
      slug,
      cardUrl: slug ? toPromptshotCardUrl(slug) : null,
      seo_readiness_score: classified.seo_readiness_score,
      tagSource: classified.source,
    });
  } catch (err) {
    console.error("[admin.analyze.publish] error", {
      adminEmail: gate.email,
      analyzeHistoryId,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "publish_failed" }, { status: 500 });
  }
}

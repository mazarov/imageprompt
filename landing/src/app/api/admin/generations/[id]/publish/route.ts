import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import {
  ADMIN_UGC_DATASET_SLUG,
  createUgcCardForCompletedGeneration,
} from "@/lib/web-ugc-card";
import { classifySeoTagsForPublish } from "@/lib/seo-tags-classify";
import { toPromptshotCardUrl } from "@/lib/promptshot-public-url";
import { createSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET_RESULTS = "web-generation-results";

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
    console.warn("[admin.publish] promptshot revalidate failed", {
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
  const { id: generationId } = await params;

  if (!generationId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServer();

    const { data: gen, error: genErr } = await supabase
      .from("landing_generations")
      .select(
        "id,user_id,status,client_source,prompt_text,result_storage_bucket,result_storage_path,ugc_card_id",
      )
      .eq("id", generationId)
      .eq("client_source", "admin")
      .maybeSingle();

    if (genErr || !gen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (gen.status !== "completed") {
      return NextResponse.json(
        { error: "generation_not_completed", status: gen.status },
        { status: 409 },
      );
    }

    const resultBucket =
      (gen.result_storage_bucket as string | null) || BUCKET_RESULTS;
    const resultPath = gen.result_storage_path as string | null;
    if (!resultPath) {
      return NextResponse.json({ error: "result_missing" }, { status: 409 });
    }

    let cardId = (gen.ugc_card_id as string | null) ?? null;
    let slug: string | null = null;

    if (cardId) {
      const { data: existingCard } = await supabase
        .from("prompt_cards")
        .select("id,slug,title_ru,is_published")
        .eq("id", cardId)
        .maybeSingle();

      if (existingCard?.id) {
        slug = (existingCard.slug as string | null) ?? null;
        if (existingCard.is_published) {
          const cardUrl = slug ? toPromptshotCardUrl(slug) : null;
          console.log("[admin.publish] already_published", {
            adminEmail: gate.email,
            generationId,
            cardId,
            slug,
            latencyMs: Date.now() - startedAt,
          });
          return NextResponse.json({
            ok: true,
            alreadyPublished: true,
            cardId,
            slug,
            cardUrl,
            seo_readiness_score: null,
          });
        }
      } else {
        cardId = null;
      }
    }

    if (!cardId) {
      const ugc = await createUgcCardForCompletedGeneration(supabase, {
        generationId,
        userId: gen.user_id as string,
        promptText: (gen.prompt_text as string) || "",
        resultBucket,
        resultPath,
        sourceChannel: "admin_generation",
        datasetSlug: ADMIN_UGC_DATASET_SLUG,
        variantLabel: "admin",
        matchStrategy: "admin_generation",
      });
      if (!ugc?.cardId) {
        return NextResponse.json({ error: "card_create_failed" }, { status: 500 });
      }
      cardId = ugc.cardId;
      slug = ugc.slug;
    }

    const { data: card, error: cardErr } = await supabase
      .from("prompt_cards")
      .select("id,slug,title_ru,is_published")
      .eq("id", cardId)
      .single();

    if (cardErr || !card) {
      return NextResponse.json({ error: "card_not_found" }, { status: 404 });
    }

    slug = (card.slug as string | null) ?? slug;

    const { data: variants } = await supabase
      .from("prompt_variants")
      .select("prompt_text_ru,prompt_text_en")
      .eq("card_id", cardId)
      .order("variant_index", { ascending: true });

    const promptTexts = (variants || [])
      .map((v) => {
        const row = v as { prompt_text_ru: string | null; prompt_text_en: string | null };
        return row.prompt_text_ru?.trim() || row.prompt_text_en?.trim() || null;
      })
      .filter((t): t is string => !!t);

    if (promptTexts.length === 0) {
      const fallback = String(gen.prompt_text || "").trim();
      if (fallback) promptTexts.push(fallback);
    }

    const titleRu = (card.title_ru as string | null) ?? null;
    const classified = await classifySeoTagsForPublish(supabase, titleRu, promptTexts);

    const { error: pubErr } = await supabase
      .from("prompt_cards")
      .update({
        is_published: true,
        seo_tags: classified.seo_tags,
        seo_readiness_score: classified.seo_readiness_score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);

    if (pubErr) {
      console.error("[admin.publish] update failed", {
        generationId,
        cardId,
        message: pubErr.message,
      });
      return NextResponse.json({ error: pubErr.message }, { status: 500 });
    }

    if (slug) {
      revalidatePath(`/p/${slug}`);
      revalidatePath("/sitemap.xml");
      void maybeRevalidatePromptshot(slug);
    }

    const cardUrl = slug ? toPromptshotCardUrl(slug) : null;

    console.log("[admin.publish] published", {
      adminEmail: gate.email,
      generationId,
      cardId,
      slug,
      tagSource: classified.source,
      viaProxy: classified.viaProxy,
      seo_readiness_score: classified.seo_readiness_score,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      alreadyPublished: false,
      cardId,
      slug,
      cardUrl,
      seo_readiness_score: classified.seo_readiness_score,
      tagSource: classified.source,
    });
  } catch (err) {
    console.error("[admin.publish] error", {
      adminEmail: gate.email,
      generationId,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "publish_failed" }, { status: 500 });
  }
}

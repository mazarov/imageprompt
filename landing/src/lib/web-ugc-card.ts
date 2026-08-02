import type { SupabaseClient } from "@supabase/supabase-js";

export const WEB_UGC_DATASET_SLUG = "web_generation_ugc";
export const ADMIN_UGC_DATASET_SLUG = "admin_generation_ugc";
export const ADMIN_ANALYZE_UGC_DATASET_SLUG = "admin_analyze_ugc";
const WEB_UGC_CHANNEL = "Web generation UGC";
const ADMIN_UGC_CHANNEL = "Admin generation UGC";
const ADMIN_ANALYZE_UGC_CHANNEL = "Admin analyze UGC";

function makeSourceMessageId(): number {
  const base = Date.now() * 1000;
  const suffix = Math.floor(Math.random() * 1000);
  return base + suffix;
}

export function buildUgcCardTitle(prompt: string): string {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Моя генерация";
  return normalized.length > 90 ? `${normalized.slice(0, 87).trim()}...` : normalized;
}

async function ensureUgcDataset(
  supabase: SupabaseClient,
  datasetSlug: string,
  channelTitle: string,
  sourceType: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("import_datasets")
    .select("id")
    .eq("dataset_slug", datasetSlug)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("import_datasets")
    .insert({
      dataset_slug: datasetSlug,
      channel_title: channelTitle,
      source_type: sourceType,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created?.id) {
    throw new Error(`ugc_dataset_create_failed:${error?.message || "unknown"}`);
  }
  return created.id as string;
}

async function createSyntheticUgcSourceGroup(
  supabase: SupabaseClient,
  datasetId: string,
  prompt: string,
  generationId: string,
  sourceKey: string,
): Promise<{ sourceGroupId: string; sourceMessageId: number }> {
  const now = new Date().toISOString();
  const { data: runRow, error: runError } = await supabase
    .from("import_runs")
    .insert({
      dataset_id: datasetId,
      mode: "incremental",
      status: "success",
      finished_at: now,
      html_files_total: 1,
      groups_total: 1,
      groups_parsed: 1,
    })
    .select("id")
    .single();
  if (runError || !runRow?.id) {
    throw new Error(`import_run_create_failed:${runError?.message || "unknown"}`);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sourceMessageId = makeSourceMessageId();
    const { data: groupRow, error: groupError } = await supabase
      .from("source_message_groups")
      .insert({
        dataset_id: datasetId,
        run_id: runRow.id,
        source_group_key: `${sourceKey}:${generationId}:${sourceMessageId}`,
        source_message_id: sourceMessageId,
        source_message_ids: [sourceMessageId],
        source_published_at: now,
        raw_text_plain: prompt,
        raw_payload: {
          source: sourceKey,
          generationId,
        },
      })
      .select("id,source_message_id")
      .single();

    if (!groupError && groupRow?.id) {
      return {
        sourceGroupId: groupRow.id as string,
        sourceMessageId: Number(groupRow.source_message_id || sourceMessageId),
      };
    }
  }
  throw new Error("source_group_create_failed:conflict");
}

/**
 * After a generation completes: create draft prompt_cards row + media + variant, set landing_generations.ugc_card_id.
 * Idempotent if ugc_card_id already set.
 */
export async function createUgcCardForCompletedGeneration(
  supabase: SupabaseClient,
  params: {
    generationId: string;
    userId: string;
    promptText: string;
    resultBucket: string;
    resultPath: string;
    sourceChannel?: string;
    datasetSlug?: string;
    variantLabel?: string;
    matchStrategy?: string;
  },
): Promise<{ cardId: string; slug: string | null } | null> {
  const {
    generationId,
    userId,
    promptText,
    resultBucket,
    resultPath,
    sourceChannel = "web_generation",
    datasetSlug = WEB_UGC_DATASET_SLUG,
    variantLabel = "web",
    matchStrategy = "web_generation",
  } = params;

  const channelTitle =
    datasetSlug === ADMIN_UGC_DATASET_SLUG ? ADMIN_UGC_CHANNEL : WEB_UGC_CHANNEL;
  const sourceType = sourceChannel;
  const sourceKey = sourceChannel === "admin_generation" ? "admin_gen" : "web_gen";

  const { data: genRow, error: genErr } = await supabase
    .from("landing_generations")
    .select("id,user_id,status,ugc_card_id")
    .eq("id", generationId)
    .single();

  if (genErr || !genRow || genRow.user_id !== userId || genRow.status !== "completed") {
    return null;
  }

  if (genRow.ugc_card_id) {
    const { data: existingCard } = await supabase
      .from("prompt_cards")
      .select("id,slug")
      .eq("id", genRow.ugc_card_id)
      .maybeSingle();
    if (existingCard?.id) {
      return { cardId: existingCard.id as string, slug: (existingCard.slug as string) ?? null };
    }
  }

  const datasetId = await ensureUgcDataset(supabase, datasetSlug, channelTitle, sourceType);
  const { sourceGroupId, sourceMessageId } = await createSyntheticUgcSourceGroup(
    supabase,
    datasetId,
    promptText,
    generationId,
    sourceKey,
  );

  const titleRu = buildUgcCardTitle(promptText);

  // prompt_cards.author_user_id still FKs auth.users (sql/156); admin sessions use
  // imageprompt_users ids and fail that constraint. Admin catalog cards are not
  // owner-bound — leave null (ON DELETE SET NULL allows it).
  const authorUserId = sourceChannel === "admin_generation" ? null : userId;

  const { data: createdCard, error: createCardError } = await supabase
    .from("prompt_cards")
    .insert({
      source_group_id: sourceGroupId,
      title_ru: titleRu,
      title_en: null,
      hashtags: [],
      tags: [],
      seo_tags: {},
      seo_readiness_score: 0,
      source_channel: sourceChannel,
      source_dataset_slug: datasetSlug,
      source_message_id: sourceMessageId,
      source_date: new Date().toISOString(),
      parse_status: "parsed",
      parse_warnings: [],
      is_published: false,
      author_user_id: authorUserId,
    })
    .select("id,slug")
    .single();

  if (createCardError || !createdCard?.id) {
    console.error("[web-ugc-card] prompt_cards insert failed", {
      generationId,
      sourceChannel,
      authorUserId,
      error: createCardError?.message ?? null,
    });
    return null;
  }

  const cardId = createdCard.id as string;

  const { error: mediaInsertError } = await supabase.from("prompt_card_media").insert({
    card_id: cardId,
    media_index: 0,
    media_type: "photo",
    storage_bucket: resultBucket,
    storage_path: resultPath,
    original_relative_path: resultPath,
    is_primary: true,
  });
  if (mediaInsertError) {
    console.error("[web-ugc-card] media insert failed", {
      generationId,
      cardId,
      error: mediaInsertError.message,
    });
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    return null;
  }

  const { error: variantInsertError } = await supabase.from("prompt_variants").insert({
    card_id: cardId,
    variant_index: 0,
    label_raw: variantLabel,
    prompt_text_ru: promptText,
    prompt_text_en: null,
    match_strategy: matchStrategy,
  });
  if (variantInsertError) {
    console.error("[web-ugc-card] variant insert failed", {
      generationId,
      cardId,
      error: variantInsertError.message,
    });
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    return null;
  }

  const { data: linkedRows, error: linkError } = await supabase
    .from("landing_generations")
    .update({ ugc_card_id: cardId, updated_at: new Date().toISOString() })
    .eq("id", generationId)
    .is("ugc_card_id", null)
    .select("id");

  if (linkError) {
    console.error("[web-ugc-card] generation link failed", {
      generationId,
      cardId,
      error: linkError.message,
    });
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    return null;
  }

  if (!linkedRows || linkedRows.length === 0) {
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    const { data: other } = await supabase
      .from("landing_generations")
      .select("ugc_card_id")
      .eq("id", generationId)
      .maybeSingle();
    const existingId = other?.ugc_card_id as string | undefined;
    if (existingId) {
      const { data: c } = await supabase.from("prompt_cards").select("id,slug").eq("id", existingId).maybeSingle();
      if (c?.id) {
        return { cardId: c.id as string, slug: (c.slug as string) ?? null };
      }
    }
    return null;
  }

  return { cardId, slug: (createdCard.slug as string) ?? null };
}

/**
 * Creates a draft catalog card from an analyzed user photo and links it to
 * analyze_history. The source photo must already be copied to a public bucket.
 */
export async function createUgcCardForAnalyzeHistory(
  supabase: SupabaseClient,
  params: {
    analyzeHistoryId: string;
    promptText: string;
    resultBucket: string;
    resultPath: string;
  },
): Promise<{ cardId: string; slug: string | null } | null> {
  const { analyzeHistoryId, promptText, resultBucket, resultPath } = params;

  const { data: historyRow, error: historyError } = await supabase
    .from("analyze_history")
    .select("id,ugc_card_id")
    .eq("id", analyzeHistoryId)
    .maybeSingle();

  if (historyError || !historyRow) return null;

  if (historyRow.ugc_card_id) {
    const { data: existingCard } = await supabase
      .from("prompt_cards")
      .select("id,slug")
      .eq("id", historyRow.ugc_card_id)
      .maybeSingle();
    if (existingCard?.id) {
      return {
        cardId: existingCard.id as string,
        slug: (existingCard.slug as string) ?? null,
      };
    }
  }

  const datasetId = await ensureUgcDataset(
    supabase,
    ADMIN_ANALYZE_UGC_DATASET_SLUG,
    ADMIN_ANALYZE_UGC_CHANNEL,
    "admin_analyze",
  );
  const { sourceGroupId, sourceMessageId } = await createSyntheticUgcSourceGroup(
    supabase,
    datasetId,
    promptText,
    analyzeHistoryId,
    "admin_analyze",
  );

  const { data: createdCard, error: createCardError } = await supabase
    .from("prompt_cards")
    .insert({
      source_group_id: sourceGroupId,
      title_ru: buildUgcCardTitle(promptText),
      title_en: null,
      hashtags: [],
      tags: [],
      seo_tags: {},
      seo_readiness_score: 0,
      source_channel: "admin_analyze",
      source_dataset_slug: ADMIN_ANALYZE_UGC_DATASET_SLUG,
      source_message_id: sourceMessageId,
      source_date: new Date().toISOString(),
      parse_status: "parsed",
      parse_warnings: [],
      is_published: false,
      author_user_id: null,
    })
    .select("id,slug")
    .single();

  if (createCardError || !createdCard?.id) {
    console.error("[web-ugc-card] analyze prompt_cards insert failed", {
      analyzeHistoryId,
      error: createCardError?.message ?? null,
    });
    return null;
  }

  const cardId = createdCard.id as string;
  const { error: mediaInsertError } = await supabase.from("prompt_card_media").insert({
    card_id: cardId,
    media_index: 0,
    media_type: "photo",
    storage_bucket: resultBucket,
    storage_path: resultPath,
    original_relative_path: resultPath,
    is_primary: true,
  });
  if (mediaInsertError) {
    console.error("[web-ugc-card] analyze media insert failed", {
      analyzeHistoryId,
      cardId,
      error: mediaInsertError.message,
    });
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    return null;
  }

  const { error: variantInsertError } = await supabase.from("prompt_variants").insert({
    card_id: cardId,
    variant_index: 0,
    label_raw: "analyze",
    prompt_text_ru: promptText,
    prompt_text_en: null,
    match_strategy: "admin_analyze",
  });
  if (variantInsertError) {
    console.error("[web-ugc-card] analyze variant insert failed", {
      analyzeHistoryId,
      cardId,
      error: variantInsertError.message,
    });
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    return null;
  }

  const { data: linkedRows, error: linkError } = await supabase
    .from("analyze_history")
    .update({ ugc_card_id: cardId })
    .eq("id", analyzeHistoryId)
    .is("ugc_card_id", null)
    .select("id");

  if (linkError) {
    console.error("[web-ugc-card] analyze history link failed", {
      analyzeHistoryId,
      cardId,
      error: linkError.message,
    });
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    return null;
  }

  if (!linkedRows || linkedRows.length === 0) {
    await supabase.from("prompt_cards").delete().eq("id", cardId);
    const { data: other } = await supabase
      .from("analyze_history")
      .select("ugc_card_id")
      .eq("id", analyzeHistoryId)
      .maybeSingle();
    const existingId = other?.ugc_card_id as string | undefined;
    if (existingId) {
      const { data: existingCard } = await supabase
        .from("prompt_cards")
        .select("id,slug")
        .eq("id", existingId)
        .maybeSingle();
      if (existingCard?.id) {
        return {
          cardId: existingCard.id as string,
          slug: (existingCard.slug as string) ?? null,
        };
      }
    }
    return null;
  }

  return { cardId, slug: (createdCard.slug as string) ?? null };
}

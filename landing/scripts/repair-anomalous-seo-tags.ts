/**
 * Audit published prompt cards for implausibly broad SEO tag sets and optionally
 * reclassify them through the guarded runtime classifier.
 *
 * Safe default (read-only):
 *   npx tsx scripts/repair-anomalous-seo-tags.ts
 *
 * Apply validated replacements:
 *   npx tsx scripts/repair-anomalous-seo-tags.ts --apply
 *
 * Args: --apply, --limit N, --card-id <uuid>, --sleep-ms N
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  computeSeoReadinessScore,
  inspectSeoTagOutput,
  parseClassifyJson,
  SeoTagsClassifyError,
} from "../src/lib/seo-tags-classify";

type Args = {
  apply: boolean;
  limit?: number;
  cardId?: string;
  sleepMs: number;
};

type VariantRow = {
  prompt_text_ru: string | null;
  prompt_text_en: string | null;
  variant_index: number;
};

type CardRow = {
  id: string;
  slug: string;
  title_ru: string | null;
  source_channel: string | null;
  source_dataset_slug: string | null;
  seo_tags: unknown;
};

function loadEnvFiles(): void {
  const landingRoot = process.cwd();
  const repoRoot = path.resolve(landingRoot, "..");
  for (const candidate of [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.local"),
    path.join(landingRoot, ".env.local"),
    path.join(landingRoot, ".env"),
  ]) {
    if (existsSync(candidate)) loadDotenv({ path: candidate, override: false });
  }
}

function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_SUPABASE_PUBLIC_URL ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let limit: number | undefined;
  let cardId: string | undefined;
  let sleepMs = 1_000;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") apply = true;
    if (token === "--limit") {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.floor(parsed);
    }
    if (token === "--card-id") {
      const parsed = String(argv[++i] || "").trim();
      if (parsed) cardId = parsed;
    }
    if (token === "--sleep-ms") {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed >= 0) sleepMs = Math.floor(parsed);
    }
  }

  return { apply, limit, cardId, sleepMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClassifierOrigin(): string {
  return (
    process.env.IMAGEPROMPT_API_ORIGIN ||
    process.env.NEXT_PUBLIC_IMAGEPROMPT_API_ORIGIN ||
    "https://imageprompt.tools"
  )
    .trim()
    .replace(/\/+$/, "");
}

async function classifyViaRuntime(
  title: string | null,
  promptTexts: string[],
): Promise<{ seo_tags: Record<string, unknown>; seo_readiness_score: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${getClassifierOrigin()}/api/internal/seo-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, promptTexts }),
        signal: AbortSignal.timeout(75_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`runtime classifier ${response.status}: ${text.slice(0, 300)}`);
      }

      const remote = JSON.parse(text) as {
        seo_tags?: Record<string, unknown>;
        new_tags?: unknown[];
      };
      const guarded = parseClassifyJson(
        JSON.stringify({
          ...(remote.seo_tags || {}),
          new_tags: Array.isArray(remote.new_tags) ? remote.new_tags : [],
        }),
      );
      return {
        seo_tags: guarded.seoTags as unknown as Record<string, unknown>,
        seo_readiness_score: computeSeoReadinessScore(guarded.seoTags),
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(
          `[runtime-retry] attempt=${attempt} code=${
            error instanceof SeoTagsClassifyError ? error.code : "request_failed"
          }`,
        );
        await sleep(1_500 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function maybeRevalidatePromptshot(slug: string): Promise<void> {
  const url = String(process.env.PROMPTSHOT_REVALIDATE_URL || "").trim();
  const secret = String(process.env.PROMPTSHOT_REVALIDATE_SECRET || "").trim();
  if (!url || !secret) return;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ slug, paths: [`/p/${slug}`, "/sitemap.xml"] }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    console.warn(`[revalidate-failed] ${slug} status=${response.status}`);
  }
}

async function fetchPublishedCards(
  supabase: SupabaseClient,
  cardId?: string,
): Promise<CardRow[]> {
  const rows: CardRow[] = [];
  const pageSize = 500;
  let from = 0;

  for (;;) {
    let query = supabase
      .from("prompt_cards")
      .select(
        "id,slug,title_ru,source_channel,source_dataset_slug,seo_tags",
      )
      .eq("is_published", true)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (cardId) query = query.eq("id", cardId);

    const { data, error } = await query;
    if (error) throw new Error(`prompt_cards query failed: ${error.message}`);
    if (!data?.length) break;

    rows.push(...(data as unknown as CardRow[]));
    if (data.length < pageSize || cardId) break;
    from += pageSize;
  }

  return rows;
}

async function fetchPromptTexts(
  supabase: SupabaseClient,
  cardId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("prompt_variants")
    .select("prompt_text_ru,prompt_text_en,variant_index")
    .eq("card_id", cardId)
    .order("variant_index", { ascending: true });
  if (error) throw new Error(`prompt_variants query failed: ${error.message}`);

  return ((data || []) as VariantRow[])
    .sort((a, b) => a.variant_index - b.variant_index)
    .map((variant) => variant.prompt_text_ru?.trim() || variant.prompt_text_en?.trim() || "")
    .filter(Boolean);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFiles();

  const url = resolveSupabaseUrl();
  if (!url) throw new Error("Missing Supabase URL");
  const supabase = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const published = await fetchPublishedCards(supabase, args.cardId);
  const anomalous = published
    .map((card) => ({ card, diagnostics: inspectSeoTagOutput(card.seo_tags) }))
    .filter(({ diagnostics }) => diagnostics.suspiciousReasons.length > 0);
  const queue = args.limit ? anomalous.slice(0, args.limit) : anomalous;

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry-run",
        publishedScanned: published.length,
        anomalousFound: anomalous.length,
        willProcess: queue.length,
      },
      null,
      2,
    ),
  );

  for (const { card, diagnostics } of queue) {
    console.log(
      `[anomaly] ${card.id} ${card.slug} source=${card.source_channel || "unknown"} ` +
        `accepted=${diagnostics.totalAccepted} reasons=${diagnostics.suspiciousReasons.join(";")}`,
    );
  }

  if (!args.apply || queue.length === 0) return;

  let updated = 0;
  let failed = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const { card } = queue[index]!;

    try {
      const promptTexts = await fetchPromptTexts(supabase, card.id);
      if (promptTexts.length === 0) {
        throw new Error("no prompt text");
      }
      const classified = await classifyViaRuntime(card.title_ru, promptTexts);
      const { error } = await supabase
        .from("prompt_cards")
        .update({
          seo_tags: classified.seo_tags,
          seo_readiness_score: classified.seo_readiness_score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", card.id)
        .eq("is_published", true);
      if (error) throw new Error(`update failed: ${error.message}`);

      await maybeRevalidatePromptshot(card.slug);
      updated += 1;
      console.log(
        `[updated] ${card.id} ${card.slug} score=${classified.seo_readiness_score}`,
      );
    } catch (error) {
      failed += 1;
      console.error(
        `[failed] ${card.id} ${card.slug} code=${
          error instanceof SeoTagsClassifyError ? error.code : "unknown"
        } message=${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (index < queue.length - 1 && args.sleepMs > 0) {
      await sleep(args.sleepMs);
    }
  }

  console.log(JSON.stringify({ updated, failed, total: queue.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

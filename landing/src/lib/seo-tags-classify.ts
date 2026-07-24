/**
 * Runtime SEO tag classification for admin/UGC publish (aligned with aiphoto fill-seo-tags).
 * Uses Gemini via gemini-proxy. No regex fallback — failures throw.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGeminiBaseUrl } from "@/lib/gemini-base-url";
import { TAG_REGISTRY, type Dimension } from "@/lib/tag-registry";

const DIMENSIONS: Dimension[] = [
  "audience_tag",
  "style_tag",
  "occasion_tag",
  "object_tag",
  "doc_task_tag",
];

const GEMINI_SEO_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 60_000;

export type SeoTags = {
  audience_tag: string[];
  style_tag: string[];
  occasion_tag: string[];
  object_tag: string[];
  doc_task_tag: string[];
  labels: { ru: string[]; en: string[] };
};

export type SeoTagSource = "llm";

type NewTagMeta = {
  slug: string;
  dimension: Dimension;
  labelRu: string;
  labelEn: string;
};

type ClassifyResult = {
  seoTags: SeoTags;
  newTags: NewTagMeta[];
};

const SLUG_LABELS = Object.fromEntries(
  TAG_REGISTRY.map((t) => [t.slug, { ru: t.labelRu.toLowerCase(), en: t.labelEn.toLowerCase() }]),
);

const VALID_SLUGS_BY_DIM = new Map<Dimension, Set<string>>();
for (const dim of DIMENSIONS) {
  VALID_SLUGS_BY_DIM.set(dim, new Set(TAG_REGISTRY.filter((t) => t.dimension === dim).map((t) => t.slug)));
}

const TAG_ALIASES: Record<string, string> = {
  chernо_beloe: "cherno_beloe",
  s_iphone: "iphone",
  s_snegom: "sneg",
  fotorealistichnoe: "fotorealizm",
  s_buketom: "s_cvetami",
};

function normalizeTagSlug(slug: string): string {
  return TAG_ALIASES[slug] ?? slug;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptySeoTags(): SeoTags {
  return {
    audience_tag: [],
    style_tag: [],
    occasion_tag: [],
    object_tag: [],
    doc_task_tag: [],
    labels: { ru: [], en: [] },
  };
}

function fillLabels(tags: SeoTags): void {
  const allSlugs = [
    ...tags.audience_tag,
    ...tags.style_tag,
    ...tags.occasion_tag,
    ...tags.object_tag,
    ...tags.doc_task_tag,
  ];
  if (allSlugs.length > 0) {
    const ruParts = allSlugs.map((s) => SLUG_LABELS[s]?.ru ?? s).slice(0, 3);
    const enParts = allSlugs.map((s) => SLUG_LABELS[s]?.en ?? s).slice(0, 3);
    tags.labels.ru = [`Промт для фото ${ruParts.join(", ")}`];
    tags.labels.en = [`Photo prompt: ${enParts.join(", ")}`];
  }
}

export function computeSeoReadinessScore(seoTags: SeoTags): number {
  let score = 0;
  for (const dim of DIMENSIONS) {
    if (seoTags[dim].length > 0) score += 20;
  }
  return Math.min(100, score);
}

function buildTagListForPrompt(): string {
  const lines: string[] = [];
  for (const dim of DIMENSIONS) {
    const dimTags = TAG_REGISTRY.filter((t) => t.dimension === dim);
    lines.push(`\n${dim}:`);
    for (const t of dimTags) {
      lines.push(`  ${t.slug} — ${t.labelRu} (${t.labelEn})`);
    }
  }
  return lines.join("\n");
}

function buildJsonFormatInstruction(): string {
  return `
Respond with a JSON object (no markdown fences). Schema:
{
  "audience_tag": ["slug1", ...],
  "style_tag": ["slug1", ...],
  "occasion_tag": ["slug1", ...],
  "object_tag": ["slug1", ...],
  "doc_task_tag": ["slug1", ...],
  "new_tags": [{ "slug": "...", "dimension": "...", "labelRu": "...", "labelEn": "..." }, ...]
}`;
}

const SYSTEM_PROMPT = `You are a photo prompt classifier for an SEO-driven photo prompt catalog.

Given a prompt (title + text in Russian), assign ALL relevant tags across 5 dimensions.

STEP 1 — Use KNOWN tags from the list below whenever they match.
STEP 2 — If the prompt describes a scene, location, style, or subject NOT covered by the known tags, CREATE a new tag.

Rules for KNOWN tags:
- A tag is relevant if the prompt EXPLICITLY describes the corresponding scene/object/style/audience/event
- Ignore boilerplate like CRITICAL RULES, camera EXIF, and generic photorealism instructions when choosing tags
- For audience_tag: determine by character descriptions and relationships. Woman / female subject / she = devushka. Man = muzhchina. Two together = para. Family relationships = corresponding tag (s_mamoy, s_dochkoy, etc.)
- For style_tag: determine by shooting technique, visual style, references (portrait, studio, GTA, anime, etc.)
- For object_tag: determine by objects, locations, clothing category, accessories in the scene
- For occasion_tag: determine by mentions of holidays or events
- For doc_task_tag: determine by the purpose of the photo

Rules for NEW tags:
- A good new tag is something a user would SEARCH for on Google/Yandex
- The slug must be latin snake_case transliteration of the Russian concept
- Provide labelRu and labelEn
- Place new slugs in the corresponding dimension arrays AND in the "new_tags" metadata array

DO NOT create tags for: generic clothing, camera params, AI instructions, hair/skin, micro-textures, lighting-only, emotions-only, pose-only.

IMPORTANT — Use existing slugs, do NOT create duplicates (devushka, muzhchina, cherno_beloe, iphone, sneg, etc.).

Precision > recall for new tags.

Known tags:
${buildTagListForPrompt()}
${buildJsonFormatInstruction()}`;

export class SeoTagsClassifyError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SeoTagsClassifyError";
    this.code = code;
    this.details = details;
  }
}

async function geminiChatJson(
  supabase: SupabaseClient,
  userText: string,
): Promise<{ text: string; viaProxy: boolean; finishReason: string | null; baseUrlHost: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new SeoTagsClassifyError("missing_api_key", "Missing GEMINI_API_KEY");
  }

  const { baseUrl, viaProxy } = await getGeminiBaseUrl(supabase);
  const geminiUrl = `${baseUrl}/v1beta/models/${GEMINI_SEO_MODEL}:generateContent`;
  let baseUrlHost = "invalid_base_url";
  try {
    baseUrlHost = new URL(baseUrl).hostname;
  } catch {
    // keep default
  }

  const startedAt = Date.now();
  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        // gemini-2.5-flash counts thinking toward maxOutputTokens; keep room for JSON.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 256 },
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  if (res.status === 429) {
    throw new SeoTagsClassifyError("rate_limited", "Gemini rate limited (429)", {
      viaProxy,
      baseUrlHost,
      latencyMs: Date.now() - startedAt,
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SeoTagsClassifyError(
      "gemini_http_error",
      `Gemini ${res.status}: ${text.slice(0, 300)}`,
      {
        status: res.status,
        viaProxy,
        baseUrlHost,
        latencyMs: Date.now() - startedAt,
      },
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const candidate = json.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  const text =
    candidate?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  console.log("[seo-tags-classify] gemini_response", {
    viaProxy,
    baseUrlHost,
    finishReason,
    blockReason: json.promptFeedback?.blockReason ?? null,
    textChars: text.length,
    latencyMs: Date.now() - startedAt,
  });

  if (!text) {
    throw new SeoTagsClassifyError("empty_response", "Gemini returned empty text", {
      finishReason,
      blockReason: json.promptFeedback?.blockReason ?? null,
      viaProxy,
      baseUrlHost,
    });
  }

  return { text, viaProxy, finishReason, baseUrlHost };
}

function parseClassifyJson(rawText: string): ClassifyResult {
  let jsonStr = rawText;
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    jsonStr = rawText.slice(jsonStart, jsonEnd + 1);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    throw new SeoTagsClassifyError("invalid_json", "Failed to parse Gemini JSON", {
      message: err instanceof Error ? err.message : String(err),
      textHead: rawText.slice(0, 200),
      textChars: rawText.length,
    });
  }

  const seoResult = emptySeoTags();
  const newTagsMeta: NewTagMeta[] = [];
  const newTagSlugsRaw = new Map<string, NewTagMeta>();

  const rawNewTags = parsed["new_tags"];
  if (Array.isArray(rawNewTags)) {
    for (const nt of rawNewTags) {
      if (nt && typeof nt === "object" && typeof (nt as { slug?: unknown }).slug === "string") {
        const row = nt as {
          slug: string;
          dimension?: string;
          labelRu?: string;
          labelEn?: string;
        };
        const dim = row.dimension as Dimension;
        if (DIMENSIONS.includes(dim)) {
          newTagSlugsRaw.set(`${dim}:${row.slug}`, {
            slug: row.slug,
            dimension: dim,
            labelRu: typeof row.labelRu === "string" ? row.labelRu : row.slug,
            labelEn: typeof row.labelEn === "string" ? row.labelEn : row.slug,
          });
        }
      }
    }
  }

  for (const dim of DIMENSIONS) {
    const arr = parsed[dim];
    if (!Array.isArray(arr)) continue;
    const validSet = VALID_SLUGS_BY_DIM.get(dim)!;
    for (const slug of arr) {
      if (typeof slug !== "string" || !slug) continue;
      const normalized = normalizeTagSlug(slug);
      if (!seoResult[dim].includes(normalized)) {
        seoResult[dim].push(normalized);
      }
      if (!validSet.has(normalized)) {
        const meta =
          newTagSlugsRaw.get(`${dim}:${slug}`) ?? newTagSlugsRaw.get(`${dim}:${normalized}`);
        if (meta) {
          newTagsMeta.push({ ...meta, slug: normalized });
        } else {
          newTagsMeta.push({
            slug: normalized,
            dimension: dim,
            labelRu: normalized,
            labelEn: normalized,
          });
        }
      }
    }
  }

  fillLabels(seoResult);
  return { seoTags: seoResult, newTags: newTagsMeta };
}

async function classifyWithLlm(
  supabase: SupabaseClient,
  title: string | null,
  promptTexts: string[],
): Promise<{ result: ClassifyResult; viaProxy: boolean }> {
  const userText = [
    title ? `Title: ${title}` : "",
    `Prompt:\n${promptTexts.join("\n---\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await geminiChatJson(supabase, userText);
  const result = parseClassifyJson(out.text);
  return { result, viaProxy: out.viaProxy };
}

async function classifyWithRetry(
  supabase: SupabaseClient,
  title: string | null,
  promptTexts: string[],
  maxRetries = 2,
): Promise<{ result: ClassifyResult; viaProxy: boolean }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await classifyWithLlm(supabase, title, promptTexts);
    } catch (err) {
      lastErr = err;
      console.warn("[seo-tags-classify] attempt_failed", {
        attempt: attempt + 1,
        maxRetries,
        code: err instanceof SeoTagsClassifyError ? err.code : "unknown",
        message: err instanceof Error ? err.message : String(err),
        details: err instanceof SeoTagsClassifyError ? err.details : undefined,
      });
      if (attempt < maxRetries - 1) {
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  if (lastErr instanceof SeoTagsClassifyError) throw lastErr;
  throw new SeoTagsClassifyError(
    "classify_failed",
    lastErr instanceof Error ? lastErr.message : String(lastErr),
  );
}

export type ClassifySeoTagsResult = {
  seo_tags: Record<string, unknown>;
  seo_readiness_score: number;
  source: SeoTagSource;
  viaProxy: boolean;
  /** Suggested tags not in TAG_REGISTRY — for logs/review; not persisted to seo_tags. */
  new_tags: NewTagMeta[];
};

/** Returns JSON-serializable seo_tags + readiness score. Throws if Gemini classify fails. */
export async function classifySeoTagsForPublish(
  supabase: SupabaseClient,
  title: string | null,
  promptTexts: string[],
): Promise<ClassifySeoTagsResult> {
  if (promptTexts.length === 0) {
    throw new SeoTagsClassifyError("prompt_required", "promptTexts is empty");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new SeoTagsClassifyError("missing_api_key", "Missing GEMINI_API_KEY");
  }

  const out = await classifyWithRetry(supabase, title, promptTexts);
  if (out.result.newTags.length > 0) {
    console.log("[seo-tags-classify] new_tags_dropped", {
      count: out.result.newTags.length,
      tags: out.result.newTags.slice(0, 20),
    });
  }
  return {
    seo_tags: out.result.seoTags as unknown as Record<string, unknown>,
    seo_readiness_score: computeSeoReadinessScore(out.result.seoTags),
    source: "llm",
    viaProxy: out.viaProxy,
    new_tags: out.result.newTags,
  };
}

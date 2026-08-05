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
  diagnostics: SeoTagDiagnostics;
};

const SLUG_LABELS = Object.fromEntries(
  TAG_REGISTRY.map((t) => [t.slug, { ru: t.labelRu.toLowerCase(), en: t.labelEn.toLowerCase() }]),
);

const VALID_SLUGS_BY_DIM = new Map<Dimension, Set<string>>();
for (const dim of DIMENSIONS) {
  VALID_SLUGS_BY_DIM.set(dim, new Set(TAG_REGISTRY.filter((t) => t.dimension === dim).map((t) => t.slug)));
}

const KNOWN_DIM_BY_SLUG = new Map(TAG_REGISTRY.map((t) => [t.slug, t.dimension]));

const MAX_TAGS_BY_DIMENSION: Record<Dimension, number> = {
  audience_tag: 12,
  style_tag: 15,
  occasion_tag: 8,
  object_tag: 20,
  doc_task_tag: 6,
};
const MAX_TOTAL_TAGS = 30;
const SUSPICIOUS_COVERAGE_RATIO = 0.5;
const SUSPICIOUS_COVERAGE_MIN_TAGS = 10;

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

export type SeoTagDiagnostics = {
  acceptedByDimension: Record<Dimension, number>;
  droppedByDimension: Record<Dimension, number>;
  registryCoverageByDimension: Record<Dimension, number>;
  totalAccepted: number;
  suspiciousReasons: string[];
};

function emptyDimensionCounts(): Record<Dimension, number> {
  return {
    audience_tag: 0,
    style_tag: 0,
    occasion_tag: 0,
    object_tag: 0,
    doc_task_tag: 0,
  };
}

/**
 * Detects registry dumps and other implausibly broad classifier responses.
 * Works for both fresh Gemini JSON and already persisted seo_tags.
 */
export function inspectSeoTagOutput(raw: unknown): SeoTagDiagnostics {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const acceptedByDimension = emptyDimensionCounts();
  const droppedByDimension = emptyDimensionCounts();
  const registryCoverageByDimension = emptyDimensionCounts();
  const suspiciousReasons: string[] = [];

  for (const dim of DIMENSIONS) {
    const values = Array.isArray(obj[dim]) ? (obj[dim] as unknown[]) : [];
    const unique = new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => normalizeTagSlug(value.trim())),
    );
    const validSet = VALID_SLUGS_BY_DIM.get(dim)!;
    const accepted = [...unique].filter((slug) => validSet.has(slug)).length;
    const dropped = unique.size - accepted;
    const coverage = validSet.size > 0 ? accepted / validSet.size : 0;

    acceptedByDimension[dim] = accepted;
    droppedByDimension[dim] = dropped;
    registryCoverageByDimension[dim] = coverage;

    if (accepted > MAX_TAGS_BY_DIMENSION[dim]) {
      suspiciousReasons.push(
        `${dim}:accepted=${accepted}>max=${MAX_TAGS_BY_DIMENSION[dim]}`,
      );
    }
    if (
      accepted >= SUSPICIOUS_COVERAGE_MIN_TAGS &&
      coverage >= SUSPICIOUS_COVERAGE_RATIO
    ) {
      suspiciousReasons.push(
        `${dim}:registry_coverage=${coverage.toFixed(2)} accepted=${accepted}`,
      );
    }
  }

  const totalAccepted = Object.values(acceptedByDimension).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (totalAccepted > MAX_TOTAL_TAGS) {
    suspiciousReasons.push(`total:accepted=${totalAccepted}>max=${MAX_TOTAL_TAGS}`);
  }

  return {
    acceptedByDimension,
    droppedByDimension,
    registryCoverageByDimension,
    totalAccepted,
    suspiciousReasons,
  };
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

  const blockReason = json.promptFeedback?.blockReason ?? null;

  console.log("[seo-tags-classify] gemini_response", {
    viaProxy,
    baseUrlHost,
    finishReason,
    blockReason,
    textChars: text.length,
    latencyMs: Date.now() - startedAt,
  });

  const prohibited =
    finishReason === "PROHIBITED_CONTENT" ||
    blockReason === "PROHIBITED_CONTENT" ||
    String(blockReason || "").toUpperCase().includes("PROHIBITED");

  if (!text) {
    if (prohibited) {
      throw new SeoTagsClassifyError(
        "prohibited_content",
        "Gemini blocked the prompt as PROHIBITED_CONTENT",
        { finishReason, blockReason, viaProxy, baseUrlHost },
      );
    }
    throw new SeoTagsClassifyError("empty_response", "Gemini returned empty text", {
      finishReason,
      blockReason,
      viaProxy,
      baseUrlHost,
    });
  }

  return { text, viaProxy, finishReason, baseUrlHost };
}

/** Strip sections that often trip Gemini safety while keeping catalog-relevant context. */
export function sanitizePromptTextForSeoTags(raw: string): string {
  let t = String(raw || "").replace(/\r\n/g, "\n");
  // Drop Avoid / CRITICAL RULES — not needed for catalog tags and can trigger safety.
  t = t.replace(/\nAvoid:\s*[\s\S]*?(?=\n[A-Za-z][A-Za-z ]{0,40}:|\nCRITICAL RULES|$)/gi, "\n");
  t = t.replace(/\nCRITICAL RULES[\s\S]*$/gi, "\n");
  // Soften Pose: anatomy-heavy geometry is a common PROHIBITED_CONTENT trigger.
  t = t.replace(
    /\nPose:\s*[\s\S]*?(?=\n[A-Za-z][A-Za-z ]{0,40}:|\nCRITICAL RULES|$)/gi,
    "\nPose:\n[pose details omitted for safety]\n",
  );
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  const maxChars = 2800;
  if (t.length > maxChars) {
    t = `${t.slice(0, maxChars)}\n…`;
  }
  return t;
}

function buildClassifyUserText(
  title: string | null,
  promptTexts: string[],
  opts: { sanitized: boolean },
): string {
  const joined = promptTexts
    .map((p) => (opts.sanitized ? sanitizePromptTextForSeoTags(p) : String(p || "").trim()))
    .filter(Boolean)
    .join("\n---\n");

  const titleLine = title ? `Title: ${title}` : "";
  const promptBlock = `Prompt:\n${joined}`;

  if (!opts.sanitized) {
    return [titleLine, promptBlock].filter(Boolean).join("\n\n");
  }

  return [
    "Task: SEO catalog tagging for a fictional AI photo-generation prompt.",
    "Ignore sensual, anatomical, or explicit pose details. Focus on audience, style, objects, occasion, and doc_task only.",
    "Assign tags from the known list; put inventions only in new_tags.",
    titleLine,
    promptBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseClassifyJson(rawText: string): ClassifyResult {
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
  const diagnostics = inspectSeoTagOutput(parsed);

  if (diagnostics.suspiciousReasons.length > 0) {
    throw new SeoTagsClassifyError(
      "suspicious_tag_output",
      "Gemini returned an implausibly broad SEO tag set",
      {
        acceptedByDimension: diagnostics.acceptedByDimension,
        droppedByDimension: diagnostics.droppedByDimension,
        registryCoverageByDimension: diagnostics.registryCoverageByDimension,
        totalAccepted: diagnostics.totalAccepted,
        reasons: diagnostics.suspiciousReasons,
      },
    );
  }

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
      const normalized = normalizeTagSlug(slug.trim());
      if (!normalized) continue;
      if (validSet.has(normalized) && !seoResult[dim].includes(normalized)) {
        seoResult[dim].push(normalized);
      }
      if (!validSet.has(normalized)) {
        // A known slug in the wrong dimension is invalid, not a new-tag suggestion.
        if (KNOWN_DIM_BY_SLUG.has(normalized)) continue;
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
  return { seoTags: seoResult, newTags: newTagsMeta, diagnostics };
}

async function classifyWithLlm(
  supabase: SupabaseClient,
  title: string | null,
  promptTexts: string[],
  opts: { sanitized: boolean },
): Promise<{ result: ClassifyResult; viaProxy: boolean }> {
  const userText = buildClassifyUserText(title, promptTexts, opts);
  const out = await geminiChatJson(supabase, userText);
  const result = parseClassifyJson(out.text);
  console.log("[seo-tags-classify] parsed_output", {
    acceptedByDimension: result.diagnostics.acceptedByDimension,
    droppedByDimension: result.diagnostics.droppedByDimension,
    registryCoverageByDimension: result.diagnostics.registryCoverageByDimension,
    totalAccepted: result.diagnostics.totalAccepted,
  });
  return { result, viaProxy: out.viaProxy };
}

async function classifyWithRetry(
  supabase: SupabaseClient,
  title: string | null,
  promptTexts: string[],
): Promise<{ result: ClassifyResult; viaProxy: boolean }> {
  // 1) Normal classify
  // 2) On PROHIBITED_CONTENT → sanitized retry (strip Avoid/CRITICAL RULES/Pose)
  // 3) One generic retry for transient empty/http errors
  const attempts: Array<{ sanitized: boolean; label: string }> = [
    { sanitized: false, label: "full" },
    { sanitized: true, label: "sanitized" },
    { sanitized: true, label: "sanitized_retry" },
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    try {
      const out = await classifyWithLlm(supabase, title, promptTexts, {
        sanitized: attempt.sanitized,
      });
      if (attempt.sanitized) {
        console.log("[seo-tags-classify] recovered_after_sanitize", {
          attempt: i + 1,
          label: attempt.label,
        });
      }
      return out;
    } catch (err) {
      lastErr = err;
      const code = err instanceof SeoTagsClassifyError ? err.code : "unknown";
      console.warn("[seo-tags-classify] attempt_failed", {
        attempt: i + 1,
        label: attempt.label,
        sanitized: attempt.sanitized,
        code,
        message: err instanceof Error ? err.message : String(err),
        details: err instanceof SeoTagsClassifyError ? err.details : undefined,
      });

      const isProhibited = code === "prohibited_content";
      const next = attempts[i + 1];
      if (!next) break;

      // Skip straight to sanitized path on safety blocks; otherwise brief backoff.
      if (!isProhibited || attempt.sanitized) {
        await sleep(isProhibited ? 400 : 1500 * (i + 1));
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

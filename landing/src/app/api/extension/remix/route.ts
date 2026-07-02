import { NextRequest, NextResponse } from "next/server";
import { getSectionSpec, SECTION_SPEC_ORDER } from "@/lib/extension-prompt-sections";
import {
  beginExtensionRateLimit,
  confirmExtensionRateLimitOnSuccess,
  extensionRateLimit429Body,
  extensionRateLimitCheckFromSession,
  extensionRateLimitQuotaFields,
  recordExtensionRateLimitEvent,
  releaseExtensionRateLimitOnFailure,
  reserveExtensionRateLimit,
  type ExtensionEventOutcome,
} from "@/lib/extension-rate-limit-flow";
import { extensionLog } from "@/lib/extension-pipeline-log";
import {
  logExtensionRemixClassifierRequest,
  logExtensionRemixClassifierResponse,
  logExtensionRemixGeminiRequest,
  logExtensionRemixGeminiResponse,
  logExtensionRemixStart,
  type RemixMode,
} from "@/lib/extension-remix-log";
import {
  availableSectionLabels,
  normalizeClassifierLabels,
  parseAvailablePromptSections,
  pickSectionsByLabels,
  type ParsedPromptSection,
} from "@/lib/extension-remix-sections";
import { summarizeGeminiApiResponse } from "@/lib/gemini-vibe-debug-log";
import { createSupabaseServer } from "@/lib/supabase";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_DIRECT_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_TIMEOUT_MS = 45_000;

const MAX_ORIGINAL_LEN = 8000;
const MAX_CHANGE_LEN = 1000;
const MAX_SECTION_LEN = 3000;
const MAX_SECTION_LABEL_LEN = 64;

type Style = "photoreal" | "midjourney" | "sd" | "flux" | "nano" | "dalle";
const VALID_STYLES: Style[] = ["photoreal", "midjourney", "sd", "flux", "nano", "dalle"];
const VALID_AUTO_LABELS = new Set<string>([...SECTION_SPEC_ORDER, "CRITICAL RULES", "Prompt"]);

/**
 * Disable Gemini's content blocking for the remix rewrite.
 *
 * The analyze step can legitimately produce detailed fashion / boudoir / body
 * descriptions. When that text is later fed back into remix as plain input, the
 * default safety thresholds (BLOCK_MEDIUM_AND_ABOVE) frequently block the whole
 * prompt (promptFeedback.blockReason: SAFETY), Gemini returns no candidate text,
 * and the route falls into its "empty response → 502" path. Relaxing the
 * thresholds here lets legitimate prompts be edited instead of silently failing.
 */
const GEMINI_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

const STYLE_HINT: Record<Style, string> = {
  photoreal: "photorealistic style, natural lighting, realistic detail",
  midjourney: "Midjourney-style prompt, evocative, with quality and aspect cues",
  sd: "Stable Diffusion-style prompt with descriptive tags",
  flux: "Flux-style prompt, clean and descriptive",
  nano: "Nano Banana (Gemini) natural-language image prompt",
  dalle: "DALL·E natural-language descriptive prompt",
};

/** Mirror getGeminiBaseUrl from analyze: prefer DO proxy when photo_app_config.gemini_use_proxy is on. */
async function getGeminiBaseUrl(supabase: ReturnType<typeof createSupabaseServer>): Promise<string> {
  const proxyEnv = (process.env.GEMINI_PROXY_BASE_URL || "").replace(/\/+$/, "");
  try {
    const { data } = await supabase
      .from("photo_app_config")
      .select("value")
      .eq("key", "gemini_use_proxy")
      .maybeSingle();

    const raw = String(data?.value ?? "").trim().toLowerCase();
    const useProxy = raw === "" ? true : ["true", "1", "yes", "y", "on"].includes(raw);

    if (useProxy && proxyEnv) return proxyEnv;
  } catch {
    if (proxyEnv) return proxyEnv;
  }
  return GEMINI_DIRECT_BASE_URL;
}

function normalizeLocale(value: unknown): string {
  if (typeof value !== "string") return "en";

  const raw = value.trim();
  if (!raw || raw.length > 32) return "en";

  try {
    return new Intl.Locale(raw).toString();
  } catch {
    return "en";
  }
}

function remixLanguageInstruction(locale: string): string {
  if (locale === "en") return "";

  return [
    `Write the rewritten descriptive content in the user's locale: ${locale}.`,
    "Preserve existing section headings exactly as provided.",
    "Do not translate technical generator syntax, style flags, or section headings.",
  ].join("\n");
}

const SECTION_FEWSHOT = `\
Example of the expected transformation (illustrative only; never copy its wording):
--- Input section ---
Scene:
A person stands in a room.
--- Edit ---
just a plain room with a white wall
--- Rewritten section ---
Scene:
The subject stands in a plain, minimalist room with a smooth white wall behind them under even neutral daylight, no furniture or props in frame.`;

function buildSectionInstruction(
  sectionLabel: string,
  sectionText: string,
  changeRequest: string,
  style: Style,
  locale: string,
): string {
  const styleLine =
    style === "photoreal" ? "" : `Keep the wording compatible with this target style: ${STYLE_HINT[style]}.`;

  const spec = getSectionSpec(sectionLabel);

  return [
    `Rewrite only the "${sectionLabel}" section of an AI image prompt according to this edit: ${changeRequest}.`,
    "Preserve the section heading and heading style exactly as in the input.",
    remixLanguageInstruction(locale),
    spec ? `This section must follow its original specification:\n${spec}` : "",
    "Treat the edit as user intent, not as final copy. Do not paste a short or plain edit verbatim unless it is already a complete polished prompt section.",
    "Use the current section as the baseline and expand terse edits into a rich, concrete, generator-ready description for this section.",
    "Preserve useful compatible details from the current section, but replace details that conflict with the edit.",
    "Do not rewrite, add, or mention any other prompt sections.",
    "Return only the rewritten section text (heading plus body).",
    "End the section body with a newline. Never append the next section heading.",
    styleLine,
    spec ? SECTION_FEWSHOT : "",
    "",
    "Current section to rewrite:",
    sectionText,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildInstruction(originalPrompt: string, changeRequest: string, style: Style, locale: string): string {
  const styleLine =
    style === "photoreal" ? "" : `Keep the wording compatible with this target style: ${STYLE_HINT[style]}.`;

  return [
    `Rewrite this AI image prompt according to this edit: ${changeRequest}.`,
    "Keep the same section headings and details.",
    remixLanguageInstruction(locale),
    styleLine,
    "Return only the rewritten prompt.",
    "",
    originalPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildClassifierInstruction(
  changeRequest: string,
  availableLabels: string[],
  locale: string,
): string {
  return [
    "You classify which sections of an AI image prompt must be updated for a user edit.",
    `User edit: ${changeRequest}.`,
    remixLanguageInstruction(locale),
    `Available section labels: ${availableLabels.join(", ")}.`,
    'Return JSON only: {"labels":["Clothing","Color","Avoid"]}.',
    "Choose only labels from the available list.",
    "Include every section whose content would need to change to satisfy the edit.",
    "For clothing or outfit changes include Clothing, Color, and Avoid when available.",
    "For background or scene changes include Scene, Composition, and Avoid when available.",
    "For pose, body orientation, or camera changes include Pose, Camera, Composition, and Avoid when available.",
    "For mood or expression changes include Mood, Makeup, Visual Hook, and Avoid when available.",
    "Prefer a slightly broader set over returning too few labels.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildScopedAutoInstruction(
  selectedSections: ParsedPromptSection[],
  changeRequest: string,
  locale: string,
): string {
  const labels = selectedSections.map((section) => section.label).join(", ");
  const sectionBlocks = selectedSections.map((section) => section.text).join("\n\n");

  return [
    "You are editing selected sections of an AI image prompt.",
    `Apply this edit from the user: ${changeRequest}.`,
    "Rewrite ONLY the provided sections below.",
    'Keep each section heading EXACTLY as in the input (e.g. "Clothing:").',
    "Treat the edit as user intent and expand it into rich, generator-ready section bodies.",
    "Replace conflicting details, but keep useful compatible details when they still fit.",
    remixLanguageInstruction(locale),
    labels ? `Allowed labels for "label": ${labels}.` : "",
    'Return JSON only: {"changes":[{"label":"<exact section label>","text":"<full section incl. heading>"}]}.',
    "Return one entry per provided section that needs rewriting.",
    "",
    "Sections to rewrite:",
    sectionBlocks,
  ]
    .filter(Boolean)
    .join("\n");
}

type GeminiJsonCallResult =
  | {
      ok: true;
      rawText: string;
      geminiData: unknown;
      httpStatus: number;
      latencyMs: number;
    }
  | {
      ok: false;
      error: "fetch_failed" | "gemini_http" | "bad_response" | "empty_prompt";
      httpStatus?: number;
      geminiData?: unknown;
      latencyMs: number;
    };

async function callGeminiJson({
  apiKey,
  geminiUrl,
  instruction,
  generationConfig,
}: {
  apiKey: string;
  geminiUrl: string;
  instruction: string;
  generationConfig: Record<string, unknown>;
}): Promise<GeminiJsonCallResult> {
  const startedAt = Date.now();
  const geminiBody = {
    contents: [{ role: "user", parts: [{ text: instruction }] }],
    generationConfig,
    safetySettings: GEMINI_SAFETY_SETTINGS,
  };

  let geminiRes: Response;
  try {
    geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "fetch_failed", latencyMs: Date.now() - startedAt };
  }

  if (!geminiRes.ok) {
    return {
      ok: false,
      error: "gemini_http",
      httpStatus: geminiRes.status,
      latencyMs: Date.now() - startedAt,
    };
  }

  let geminiData: unknown;
  try {
    geminiData = await geminiRes.json();
  } catch {
    return {
      ok: false,
      error: "bad_response",
      httpStatus: geminiRes.status,
      latencyMs: Date.now() - startedAt,
    };
  }

  const rawText = (
    geminiData as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  ).candidates?.[0]?.content?.parts
    ?.find((part) => typeof part.text === "string")
    ?.text?.trim();

  if (!rawText) {
    return {
      ok: false,
      error: "empty_prompt",
      httpStatus: geminiRes.status,
      geminiData,
      latencyMs: Date.now() - startedAt,
    };
  }

  return {
    ok: true,
    rawText,
    geminiData,
    httpStatus: geminiRes.status,
    latencyMs: Date.now() - startedAt,
  };
}

function parseAutoChanges(rawText: string): {
  changes: Array<{ label: string; text: string }>;
  parseFailed: boolean;
} {
  try {
    const parsedJson = JSON.parse(rawText) as {
      changes?: Array<{ label?: unknown; text?: unknown }>;
    };
    const changes = Array.isArray(parsedJson.changes)
      ? parsedJson.changes
          .map((change) => ({
            label: String(change?.label ?? "").trim(),
            text: String(change?.text ?? "").trim(),
          }))
          .filter((change) => change.label && change.text && VALID_AUTO_LABELS.has(change.label))
      : [];
    return { changes, parseFailed: false };
  } catch {
    return { changes: [], parseFailed: true };
  }
}

function buildGeminiBody(
  instruction: string,
  generationConfig: Record<string, unknown>,
): Record<string, unknown> {
  return {
    contents: [{ role: "user", parts: [{ text: instruction }] }],
    generationConfig,
    safetySettings: GEMINI_SAFETY_SETTINGS,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    originalPrompt?: unknown;
    changeRequest?: unknown;
    style?: unknown;
    sectionLabel?: unknown;
    sectionText?: unknown;
    locale?: unknown;
    mode?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const changeRequest = String(body.changeRequest ?? "").trim();
  if (!changeRequest || changeRequest.length > MAX_CHANGE_LEN) {
    return NextResponse.json(
      { error: "invalid_request", message: "changeRequest is required and must be under 1000 chars." },
      { status: 400 },
    );
  }

  const sectionLabel = String(body.sectionLabel ?? "").trim();
  const sectionText = String(body.sectionText ?? "").trim();
  const isSectionMode = Boolean(sectionLabel && sectionText);

  let originalPrompt = "";
  let instruction = "";
  let maxOutputTokens = 8192;

  if (isSectionMode) {
    if (sectionLabel.length > MAX_SECTION_LABEL_LEN) {
      return NextResponse.json(
        { error: "invalid_request", message: "sectionLabel must be under 64 chars." },
        { status: 400 },
      );
    }
    if (sectionText.length > MAX_SECTION_LEN) {
      return NextResponse.json(
        { error: "invalid_request", message: "sectionText must be under 3000 chars." },
        { status: 400 },
      );
    }
  } else {
    originalPrompt = String(body.originalPrompt ?? "").trim();
    if (!originalPrompt || originalPrompt.length > MAX_ORIGINAL_LEN) {
      return NextResponse.json(
        { error: "invalid_request", message: "originalPrompt is required and must be under 8000 chars." },
        { status: 400 },
      );
    }
  }

  const style: Style = "photoreal";

  const locale = normalizeLocale(body.locale);
  const isAutoMode = !isSectionMode && String(body.mode ?? "").trim() === "auto";
  const remixMode: RemixMode = isSectionMode ? "section" : isAutoMode ? "auto" : "legacy";
  const remixRequestId =
    req.headers.get("x-correlation-id")?.trim().slice(0, 64) ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);

  if (!isAutoMode) {
    instruction = isSectionMode
      ? buildSectionInstruction(sectionLabel, sectionText, changeRequest, style, locale)
      : buildInstruction(originalPrompt, changeRequest, style, locale);
    if (isSectionMode) maxOutputTokens = 2048;
  }

  logExtensionRemixStart({
    remixRequestId,
    mode: remixMode,
    style,
    locale,
    changeRequest,
    originalPromptChars: isSectionMode ? 0 : originalPrompt.length,
    ...(isSectionMode ? { sectionLabel, sectionTextChars: sectionText.length } : {}),
  });

  const outcomeBase = { locale, style, model: GEMINI_MODEL } as const;

  const supabase = createSupabaseServer();
  const session = await beginExtensionRateLimit(req, supabase, "remix");
  const preflightCheck = session?.check ?? null;

  if (session && !session.check.allowed) {
    recordExtensionRateLimitEvent(supabase, req, "remix", session.check, false, {
      ...outcomeBase,
      outcome: "rate_limited",
      errorCode: "rate_limited",
      httpStatus: 429,
    });
    return NextResponse.json(extensionRateLimit429Body(session.check), { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[extension.remix] GEMINI_API_KEY not set");
    recordExtensionRateLimitEvent(supabase, req, "remix", preflightCheck, false, {
      ...outcomeBase,
      outcome: "config_error",
      errorCode: "config",
      httpStatus: 500,
    });
    return NextResponse.json(
      { error: "upstream_failed", message: "Service configuration error." },
      { status: 500 },
    );
  }

  let reserved = false;
  let reservedCheck = preflightCheck;
  if (session) {
    const reserveResult = await reserveExtensionRateLimit(supabase, session);
    if (reserveResult && !reserveResult.allowed) {
      recordExtensionRateLimitEvent(supabase, req, "remix", reserveResult, false, {
        ...outcomeBase,
        outcome: "rate_limited",
        errorCode: "rate_limited",
        httpStatus: 429,
      });
      return NextResponse.json(extensionRateLimit429Body(reserveResult), { status: 429 });
    }
    if (reserveResult) {
      reserved = true;
      reservedCheck = reserveResult;
    }
  }

  const baseUrl = await getGeminiBaseUrl(supabase);
  const geminiUrl = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const geminiEndpointHost = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return "invalid_base_url";
    }
  })();
  const viaProxy = baseUrl !== GEMINI_DIRECT_BASE_URL;

  const releaseReservedRateLimit = async () => {
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
  };

  const recordRemixFailure = (fields: ExtensionEventOutcome) => {
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "remix",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
      fields,
    );
  };

  if (isAutoMode) {
    const sections = parseAvailablePromptSections(originalPrompt);
    const labelsAvailable = availableSectionLabels(sections);

    const classifierInstruction = buildClassifierInstruction(
      changeRequest,
      labelsAvailable,
      locale,
    );
    const classifierConfig: Record<string, unknown> = {
      temperature: 0,
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          labels: { type: "array", items: { type: "string" } },
        },
        required: ["labels"],
      },
    };
    const classifierBody = buildGeminiBody(classifierInstruction, classifierConfig);

    logExtensionRemixClassifierRequest({
      remixRequestId,
      mode: remixMode,
      style,
      locale,
      model: GEMINI_MODEL,
      endpointHost: geminiEndpointHost,
      viaProxy,
      instruction: classifierInstruction,
      availableLabels: labelsAvailable,
      generationConfig: classifierConfig,
      geminiBody: classifierBody,
    });

    const classifierResult = await callGeminiJson({
      apiKey,
      geminiUrl,
      instruction: classifierInstruction,
      generationConfig: classifierConfig,
    });

    extensionLog("gemini.call", {
      endpoint: "remix",
      remixRequestId,
      step: "classifier",
      status: classifierResult.ok
        ? classifierResult.httpStatus
        : (classifierResult.httpStatus ?? 503),
      latencyMs: classifierResult.latencyMs,
    });

    if (!classifierResult.ok) {
      if (classifierResult.geminiData) {
        logExtensionRemixClassifierResponse({
          remixRequestId,
          mode: remixMode,
          style,
          locale,
          model: GEMINI_MODEL,
          httpStatus: classifierResult.httpStatus ?? 502,
          latencyMs: classifierResult.latencyMs,
          geminiData: classifierResult.geminiData,
          rawText: "",
          labels: [],
          labelsParseFailed: true,
        });
      }
      await releaseReservedRateLimit();
      const httpStatus =
        classifierResult.error === "fetch_failed"
          ? 503
          : (classifierResult.httpStatus ?? 502);
      recordRemixFailure({
        ...outcomeBase,
        outcome: "upstream_error",
        errorCode: classifierResult.error,
        httpStatus,
        latencyMs: classifierResult.latencyMs,
      });
      return NextResponse.json(
        { error: "upstream_failed", message: "Something went wrong. Please try again." },
        { status: httpStatus >= 500 ? httpStatus : 502 },
      );
    }

    let selectedLabels: string[] = [];
    let labelsParseFailed = false;
    try {
      const parsedClassifier = JSON.parse(classifierResult.rawText) as { labels?: unknown };
      selectedLabels = normalizeClassifierLabels(parsedClassifier.labels, labelsAvailable);
    } catch {
      labelsParseFailed = true;
      selectedLabels = normalizeClassifierLabels([], labelsAvailable);
    }

    logExtensionRemixClassifierResponse({
      remixRequestId,
      mode: remixMode,
      style,
      locale,
      model: GEMINI_MODEL,
      httpStatus: classifierResult.httpStatus,
      latencyMs: classifierResult.latencyMs,
      geminiData: classifierResult.geminiData,
      rawText: classifierResult.rawText,
      labels: selectedLabels,
      labelsParseFailed,
    });

    const selectedSections = pickSectionsByLabels(sections, selectedLabels);
    if (selectedSections.length === 0) {
      await releaseReservedRateLimit();
      recordRemixFailure({
        ...outcomeBase,
        outcome: "upstream_error",
        errorCode: "no_sections",
        httpStatus: 502,
        latencyMs: classifierResult.latencyMs,
      });
      return NextResponse.json(
        { error: "upstream_failed", message: "Something went wrong. Please try again." },
        { status: 502 },
      );
    }

    const rewriterInstruction = buildScopedAutoInstruction(
      selectedSections,
      changeRequest,
      locale,
    );
    const rewriterConfig: Record<string, unknown> = {
      temperature: 0.4,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, text: { type: "string" } },
              required: ["label", "text"],
            },
          },
        },
        required: ["changes"],
      },
    };
    const rewriterBody = buildGeminiBody(rewriterInstruction, rewriterConfig);

    logExtensionRemixGeminiRequest({
      remixRequestId,
      mode: remixMode,
      style,
      locale,
      model: GEMINI_MODEL,
      endpointHost: geminiEndpointHost,
      viaProxy,
      instruction: rewriterInstruction,
      generationConfig: rewriterConfig,
      geminiBody: rewriterBody,
      step: "rewriter",
      selectedLabels,
    });

    const rewriterResult = await callGeminiJson({
      apiKey,
      geminiUrl,
      instruction: rewriterInstruction,
      generationConfig: rewriterConfig,
    });

    extensionLog("gemini.call", {
      endpoint: "remix",
      remixRequestId,
      step: "rewriter",
      status: rewriterResult.ok ? rewriterResult.httpStatus : (rewriterResult.httpStatus ?? 503),
      latencyMs: rewriterResult.latencyMs,
    });

    if (!rewriterResult.ok) {
      if (rewriterResult.geminiData) {
        logExtensionRemixGeminiResponse({
          remixRequestId,
          mode: remixMode,
          style,
          locale,
          model: GEMINI_MODEL,
          httpStatus: rewriterResult.httpStatus ?? 502,
          latencyMs: rewriterResult.latencyMs,
          geminiData: rewriterResult.geminiData,
          rawText: "",
          autoChanges: [],
          autoChangesParseFailed: true,
        });
      }
      await releaseReservedRateLimit();
      const httpStatus =
        rewriterResult.error === "fetch_failed" ? 503 : (rewriterResult.httpStatus ?? 502);
      recordRemixFailure({
        ...outcomeBase,
        outcome: "upstream_error",
        errorCode: rewriterResult.error,
        httpStatus,
        latencyMs: rewriterResult.latencyMs,
      });
      return NextResponse.json(
        { error: "upstream_failed", message: "Something went wrong. Please try again." },
        { status: httpStatus >= 500 ? httpStatus : 502 },
      );
    }

    const { changes: autoChanges, parseFailed: autoChangesParseFailed } = parseAutoChanges(
      rewriterResult.rawText,
    );
    const rewriterFinishReason = summarizeGeminiApiResponse(rewriterResult.geminiData).finishReason;
    const remixTruncated = String(rewriterFinishReason ?? "") === "MAX_TOKENS";

    if (autoChanges.length === 0) {
      logExtensionRemixGeminiResponse({
        remixRequestId,
        mode: remixMode,
        style,
        locale,
        model: GEMINI_MODEL,
        httpStatus: rewriterResult.httpStatus,
        latencyMs: rewriterResult.latencyMs,
        geminiData: rewriterResult.geminiData,
        rawText: rewriterResult.rawText,
        autoChanges: [],
        autoChangesParseFailed: autoChangesParseFailed || remixTruncated,
      });
      await releaseReservedRateLimit();
      recordRemixFailure({
        ...outcomeBase,
        outcome: "empty_response",
        errorCode: autoChangesParseFailed ? "bad_json" : "empty_changes",
        finishReason: String(rewriterFinishReason ?? ""),
        httpStatus: rewriterResult.httpStatus,
        latencyMs: rewriterResult.latencyMs,
      });
      return NextResponse.json(
        { error: "upstream_failed", message: "Something went wrong. Please try again." },
        { status: 502 },
      );
    }

    logExtensionRemixGeminiResponse({
      remixRequestId,
      mode: remixMode,
      style,
      locale,
      model: GEMINI_MODEL,
      httpStatus: rewriterResult.httpStatus,
      latencyMs: rewriterResult.latencyMs,
      geminiData: rewriterResult.geminiData,
      rawText: rewriterResult.rawText,
      autoChanges,
      autoChangesParseFailed,
    });

    const rateLimitResult = session
      ? await confirmExtensionRateLimitOnSuccess(supabase, session)
      : null;
    const finalCheck = extensionRateLimitCheckFromSession(session, rateLimitResult ?? reservedCheck);
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "remix",
      finalCheck,
      rateLimitResult?.allowed ?? false,
      {
        ...outcomeBase,
        outcome: remixTruncated ? "truncated" : "success",
        truncated: remixTruncated,
        finishReason: String(rewriterFinishReason ?? ""),
        httpStatus: 200,
        latencyMs: rewriterResult.latencyMs,
      },
    );

    return NextResponse.json({
      changes: autoChanges,
      ...extensionRateLimitQuotaFields(finalCheck),
    });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget: 0 },
  };
  const geminiBody = buildGeminiBody(instruction, generationConfig);

  logExtensionRemixGeminiRequest({
    remixRequestId,
    mode: remixMode,
    style,
    locale,
    model: GEMINI_MODEL,
    endpointHost: geminiEndpointHost,
    viaProxy,
    instruction,
    generationConfig,
    geminiBody,
    step: "single",
  });

  let geminiRes: Response;
  const geminiStartedAt = Date.now();
  try {
    geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[extension.remix] gemini_fetch_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    extensionLog("gemini.call", {
      endpoint: "remix",
      remixRequestId,
      status: 503,
      latencyMs: Date.now() - geminiStartedAt,
    });
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "remix",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
      {
        ...outcomeBase,
        outcome: "upstream_error",
        errorCode: "fetch_failed",
        httpStatus: 503,
        latencyMs: Date.now() - geminiStartedAt,
      },
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try again." },
      { status: 503 },
    );
  }

  extensionLog("gemini.call", {
    endpoint: "remix",
    remixRequestId,
    status: geminiRes.status,
    latencyMs: Date.now() - geminiStartedAt,
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    console.error("[extension.remix] gemini_error_response", {
      status: geminiRes.status,
      body: errText.slice(0, 300),
    });
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "remix",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
      {
        ...outcomeBase,
        outcome: "upstream_error",
        errorCode: "gemini_http",
        httpStatus: geminiRes.status,
        latencyMs: Date.now() - geminiStartedAt,
      },
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }

  let geminiData: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  try {
    geminiData = (await geminiRes.json()) as typeof geminiData;
  } catch {
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "remix",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
      {
        ...outcomeBase,
        outcome: "upstream_error",
        errorCode: "bad_response",
        httpStatus: geminiRes.status,
        latencyMs: Date.now() - geminiStartedAt,
      },
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts
    ?.find((p) => typeof p.text === "string")
    ?.text?.trim();

  const finishReason = summarizeGeminiApiResponse(geminiData).finishReason;

  if (!rawText) {
    logExtensionRemixGeminiResponse({
      remixRequestId,
      mode: remixMode,
      style,
      locale,
      model: GEMINI_MODEL,
      httpStatus: geminiRes.status,
      latencyMs: Date.now() - geminiStartedAt,
      geminiData,
      rawText: "",
    });
    console.error("[extension.remix] gemini_empty_response", {
      data: JSON.stringify(geminiData).slice(0, 300),
    });
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "remix",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
      {
        ...outcomeBase,
        outcome: "empty_response",
        errorCode: "empty_prompt",
        finishReason: String(finishReason ?? ""),
        httpStatus: geminiRes.status,
        latencyMs: Date.now() - geminiStartedAt,
      },
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }

  const remixTruncated = String(finishReason ?? "") === "MAX_TOKENS";

  logExtensionRemixGeminiResponse({
    remixRequestId,
    mode: remixMode,
    style,
    locale,
    model: GEMINI_MODEL,
    httpStatus: geminiRes.status,
    latencyMs: Date.now() - geminiStartedAt,
    geminiData,
    rawText,
  });

  const rateLimitResult = session
    ? await confirmExtensionRateLimitOnSuccess(supabase, session)
    : null;
  const finalCheck = extensionRateLimitCheckFromSession(session, rateLimitResult ?? reservedCheck);
  recordExtensionRateLimitEvent(
    supabase,
    req,
    "remix",
    finalCheck,
    rateLimitResult?.allowed ?? false,
    {
      ...outcomeBase,
      outcome: remixTruncated ? "truncated" : "success",
      truncated: remixTruncated,
      finishReason: String(finishReason ?? ""),
      httpStatus: 200,
      latencyMs: Date.now() - geminiStartedAt,
    },
  );

  return NextResponse.json(
    isSectionMode
      ? { sectionText: rawText, ...extensionRateLimitQuotaFields(finalCheck) }
      : { prompt: rawText, ...extensionRateLimitQuotaFields(finalCheck) },
  );
}

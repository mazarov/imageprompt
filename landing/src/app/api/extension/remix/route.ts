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
} from "@/lib/extension-rate-limit-flow";
import { extensionLog } from "@/lib/extension-pipeline-log";
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

function buildAutoInstruction(originalPrompt: string, changeRequest: string, locale: string): string {
  const present = SECTION_SPEC_ORDER.filter((label) =>
    new RegExp(`^${label}\\s*:`, "im").test(originalPrompt),
  );
  const specs = present
    .map((label) => {
      const spec = getSectionSpec(label);
      return spec ? `- ${label}: ${spec}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return [
    "You are editing a structured AI image prompt made of labeled sections.",
    `Apply this edit from the user: ${changeRequest}.`,
    "Analyze the whole prompt and decide which sections must change to satisfy the edit.",
    "Rewrite ONLY the sections that need to change. Do NOT include unchanged sections in the output.",
    'For each changed section keep its heading EXACTLY as in the input (e.g. "Scene:") and rewrite the body richly and generator-ready.',
    "Treat the edit as user intent, not final copy: expand terse edits into concrete descriptions; keep useful compatible details, replace only what conflicts.",
    remixLanguageInstruction(locale),
    specs ? `Section specifications to follow when rewriting:\n${specs}` : "",
    'Return JSON only: {"changes":[{"label":"<exact section label>","text":"<full section incl. heading>"}]}.',
    '"label" must be one of the exact section labels present in the prompt. If nothing needs changing, return {"changes":[]}.',
    "",
    "Full prompt:",
    originalPrompt,
  ]
    .filter(Boolean)
    .join("\n");
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

  instruction = isSectionMode
    ? buildSectionInstruction(sectionLabel, sectionText, changeRequest, style, locale)
    : isAutoMode
      ? buildAutoInstruction(originalPrompt, changeRequest, locale)
      : buildInstruction(originalPrompt, changeRequest, style, locale);
  if (isSectionMode) maxOutputTokens = 2048;
  else if (isAutoMode) maxOutputTokens = 8192;

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
  const generationConfig: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (isAutoMode) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = {
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
    };
  }
  const geminiBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: instruction }],
      },
    ],
    generationConfig,
    safetySettings: GEMINI_SAFETY_SETTINGS,
  };

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

  let autoChanges: Array<{ label: string; text: string }> = [];
  if (isAutoMode) {
    try {
      const parsedJson = JSON.parse(rawText) as { changes?: Array<{ label?: unknown; text?: unknown }> };
      autoChanges = Array.isArray(parsedJson.changes)
        ? parsedJson.changes
            .map((c) => ({ label: String(c?.label ?? "").trim(), text: String(c?.text ?? "").trim() }))
            .filter((c) => c.label && c.text && VALID_AUTO_LABELS.has(c.label))
        : [];
    } catch {
      autoChanges = [];
    }
  }

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
      : isAutoMode
        ? { changes: autoChanges, ...extensionRateLimitQuotaFields(finalCheck) }
        : { prompt: rawText, ...extensionRateLimitQuotaFields(finalCheck) },
  );
}

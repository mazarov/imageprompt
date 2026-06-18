import { NextRequest, NextResponse } from "next/server";
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
import { createSupabaseServer } from "@/lib/supabase";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_DIRECT_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_TIMEOUT_MS = 45_000;

const MAX_ORIGINAL_LEN = 8000;
const MAX_CHANGE_LEN = 1000;

type Style = "photoreal" | "midjourney" | "sd" | "flux";
const VALID_STYLES: Style[] = ["photoreal", "midjourney", "sd", "flux"];

const STYLE_HINT: Record<Style, string> = {
  photoreal: "photorealistic style, natural lighting, realistic detail",
  midjourney: "Midjourney-style prompt, evocative, with quality and aspect cues",
  sd: "Stable Diffusion-style prompt with descriptive tags",
  flux: "Flux-style prompt, clean and descriptive",
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

function buildInstruction(originalPrompt: string, changeRequest: string, style: Style): string {
  const styleLine =
    style === "photoreal" ? "" : `Keep the wording compatible with this target style: ${STYLE_HINT[style]}.`;

  return [
    `Rewrite this AI image prompt according to this edit: ${changeRequest}.`,
    "Keep the same section headings and details.",
    styleLine,
    "Return only the rewritten prompt.",
    "",
    originalPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { originalPrompt?: unknown; changeRequest?: unknown; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const originalPrompt = String(body.originalPrompt ?? "").trim();
  const changeRequest = String(body.changeRequest ?? "").trim();

  if (!originalPrompt || originalPrompt.length > MAX_ORIGINAL_LEN) {
    return NextResponse.json(
      { error: "invalid_request", message: "originalPrompt is required and must be under 8000 chars." },
      { status: 400 },
    );
  }
  if (!changeRequest || changeRequest.length > MAX_CHANGE_LEN) {
    return NextResponse.json(
      { error: "invalid_request", message: "changeRequest is required and must be under 1000 chars." },
      { status: 400 },
    );
  }

  const style: Style =
    typeof body.style === "string" && VALID_STYLES.includes(body.style as Style)
      ? (body.style as Style)
      : "photoreal";

  const supabase = createSupabaseServer();
  const session = await beginExtensionRateLimit(req, supabase, "remix");
  const preflightCheck = session?.check ?? null;

  if (session && !session.check.allowed) {
    recordExtensionRateLimitEvent(supabase, req, "remix", session.check, false);
    return NextResponse.json(extensionRateLimit429Body(session.check), { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[extension.remix] GEMINI_API_KEY not set");
    recordExtensionRateLimitEvent(supabase, req, "remix", preflightCheck, false);
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
      recordExtensionRateLimitEvent(supabase, req, "remix", reserveResult, false);
      return NextResponse.json(extensionRateLimit429Body(reserveResult), { status: 429 });
    }
    if (reserveResult) {
      reserved = true;
      reservedCheck = reserveResult;
    }
  }

  const baseUrl = await getGeminiBaseUrl(supabase);
  const geminiUrl = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const geminiBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildInstruction(originalPrompt, changeRequest, style) }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
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
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts
    ?.find((p) => typeof p.text === "string")
    ?.text?.trim();

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
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try again." },
      { status: 502 },
    );
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
  );

  return NextResponse.json({
    prompt: rawText,
    ...extensionRateLimitQuotaFields(finalCheck),
  });
}

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
import {
  logExtensionAnalyzeGeminiRequest,
  logExtensionAnalyzeGeminiResponse,
  logExtensionAnalyzeStart,
} from "@/lib/extension-analyze-log";
import { createSupabaseServer } from "@/lib/supabase";
import { buildPhotorealExtractPrompt } from "@/lib/extension-prompt-sections";
import {
  inferAspectRatioFromDimensions,
  type ExtensionImageSettings,
} from "@/lib/extension-image-settings";
import sharp from "sharp";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES * (4 / 3)) + 100; // small header overhead
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_DIRECT_BASE_URL = "https://generativelanguage.googleapis.com";

/**
 * Detailed vision extraction prompt — assembled from shared extension-prompt-sections module.
 * Previously defined inline; moved to single source of truth for reuse in remix.
 */
const PHOTOREAL_EXTRACT_PROMPT = buildPhotorealExtractPrompt();

const CRITICAL_RULES_SINGLE = `
CRITICAL RULES
- Preserve: face structure, features, skin tone, eye color, proportions.
- Subject must look naturally photographed in the setting, not pasted.
- Photorealistic output, high textural detail, high quality, 8K-grade resolution and micro-detail (maximize sharpness and surface fidelity).
`.trim();

async function readImageSettingsFromBase64(data: string): Promise<ExtensionImageSettings | null> {
  try {
    const meta = await sharp(Buffer.from(data, "base64")).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const aspectRatio = inferAspectRatioFromDimensions(width, height);
    if (!aspectRatio) return null;
    return { aspectRatio, width, height };
  } catch {
    return null;
  }
}

async function getGeminiBaseUrl(supabase: ReturnType<typeof createSupabaseServer>): Promise<string> {
  const proxyEnv = (process.env.GEMINI_PROXY_BASE_URL || "").replace(/\/+$/, "");

  // Mirror the same logic as vibe/extract: check photo_app_config.gemini_use_proxy
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
    // Fall through to direct on DB error
    if (proxyEnv) return proxyEnv;
  }

  return GEMINI_DIRECT_BASE_URL;
}
const GEMINI_TIMEOUT_MS = 30_000;

type Style = "photoreal" | "midjourney" | "sd" | "flux";
const VALID_STYLES: Style[] = ["photoreal", "midjourney", "sd", "flux"];

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

function outputLanguageInstruction(style: Style, locale: string): string {
  if (locale === "en") return "";

  if (style === "photoreal") {
    return [
      "",
      `Write all descriptive section body text in the user's locale: ${locale}.`,
      "Keep every section heading exactly in English as specified: Visual Hook:, Scene:, Genre:, Pose:, Lighting:, Camera:, Mood:, Color:, Clothing:, Makeup:, Composition:, Avoid:, and CRITICAL RULES.",
      "Do not translate, rename, remove, or reorder section headings.",
    ].join("\n");
  }

  return [
    "",
    `Write the entire prompt in the user's locale: ${locale}.`,
    "Keep generator-specific syntax, flags, and technical tokens unchanged when applicable.",
  ].join("\n");
}

function systemPrompt(style: Style, locale: string): string {
  const base = `You are an expert AI image analyst. Analyze the provided image and write a detailed generation prompt that would recreate a similar image.`;

  const styleInstructions: Record<Style, string> = {
    photoreal: PHOTOREAL_EXTRACT_PROMPT,

    midjourney: `${base}

Output a Midjourney-style prompt. Follow this structure:
[Subject description], [environment/setting], [lighting], [mood/atmosphere], [art style], [camera details if relevant] --ar [aspect ratio] --style [style tag if applicable]

Use concise, comma-separated descriptors. Include quality tags like "highly detailed, sharp focus, 8k". 
Output ONLY the prompt text, no explanations.`,

    sd: `${base}

Output a Stable Diffusion prompt in the standard format:
Positive prompt: [detailed description with quality tags]

Use comma-separated tags and descriptors. Include lighting, style, quality boosters (masterpiece, best quality, ultra-detailed, sharp focus).
Output ONLY the prompt text starting with the description, no headings or explanations.`,

    flux: `${base}

Output a FLUX-compatible prompt. FLUX uses natural language descriptions rather than tag-based prompts.
Write a clear, detailed paragraph describing: the subject, setting, lighting conditions, color palette, mood, composition, and photographic style.
Be descriptive and use complete sentences. Output ONLY the prompt paragraph, no headings or explanations.`,
  };

  return `${styleInstructions[style]}${outputLanguageInstruction(style, locale)}`;
}

function normalizeImageMimeSubtype(mime: string): string {
  const lower = mime.trim().toLowerCase().replace(/\s+/g, "");
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

function extractBase64AndMime(dataUrl: string): { mimeType: string; data: string } | null {
  const trimmed = dataUrl.trim();
  const match = /^data:\s*([^;,]+)\s*;\s*base64\s*,\s*([\s\S]+)$/i.exec(trimmed);
  if (!match) return null;

  let mimeType = normalizeImageMimeSubtype(match[1]);
  const compactB64 = match[2].replace(/\s/g, "");
  if (!compactB64.length) return null;

  try {
    const buf = Buffer.from(compactB64, "base64");
    if (!buf.length) return null;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const sniffed = sniffImageMime(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    // Trust bytes over labels: browsers/exporters often produce image/jpg or
    // octet-stream, and renamed/corrupt files can otherwise reach Gemini.
    if (sniffed) mimeType = sniffed;
    if (!allowed.has(mimeType)) return null;
    if (!sniffed) return null;
    return { mimeType, data: compactB64 };
  } catch {
    return null;
  }
}

const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/** Reduce SSRF risk: block obvious internal / cloud metadata targets (literal hostname only). */
function isUrlHostAllowedForFetch(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  if (h === "0.0.0.0") return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 0) return false;
  }
  if (h === "169.254.169.254" || h.includes("metadata.google")) return false;
  return true;
}

async function fetchImageBytesWithRedirects(startUrl: string): Promise<{ buffer: ArrayBuffer; contentType: string | null }> {
  let url = startUrl.trim();
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error("invalid_url");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid_protocol");
    if (!isUrlHostAllowedForFetch(u)) throw new Error("invalid_host");

    const res = await fetch(u.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "imageprompt-tools-image-fetch/1.0",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("bad_redirect");
      url = new URL(loc, u).toString();
      continue;
    }

    if (!res.ok) throw new Error(`http_${res.status}`);

    const len = res.headers.get("content-length");
    if (len) {
      const n = parseInt(len, 10);
      if (Number.isFinite(n) && n > MAX_IMAGE_BYTES) throw new Error("too_large");
    }

    const contentType = res.headers.get("content-type");
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("too_large");
    return { buffer: buf, contentType };
  }
  throw new Error("too_many_redirects");
}

function sniffImageMime(buffer: ArrayBuffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  const u8 = new Uint8Array(buffer.byteLength >= 12 ? buffer.slice(0, 12) : buffer);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xd8) return "image/jpeg";
  if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "image/png";
  if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return "image/gif";
  if (u8.length >= 12 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50)
    return "image/webp";
  return null;
}

function resolveMimeFromFetch(_contentType: string | null, buffer: ArrayBuffer): { mimeType: string; data: string } | null {
  const sniffed = sniffImageMime(buffer);
  if (!sniffed) return null;
  return { mimeType: sniffed, data: Buffer.from(buffer).toString("base64") };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { image_base64?: unknown; image_url?: unknown; style?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_image", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { image_base64: rawBase64, image_url: rawUrl, style: rawStyle } = body;

  const hasBase64 = typeof rawBase64 === "string" && rawBase64.trim().length > 0;
  const hasUrl = typeof rawUrl === "string" && rawUrl.trim().length > 0;

  if (hasBase64 && hasUrl) {
    return NextResponse.json(
      { error: "invalid_image", message: "Send either image_base64 or image_url, not both." },
      { status: 400 }
    );
  }

  if (!hasBase64 && !hasUrl) {
    return NextResponse.json(
      { error: "invalid_image", message: "Provide image_base64 (data URL) or image_url (https link to an image)." },
      { status: 400 }
    );
  }

  let parsed: { mimeType: string; data: string } | null = null;

  if (hasUrl) {
    const urlStr = String(rawUrl).trim();
    try {
      const { buffer, contentType } = await fetchImageBytesWithRedirects(urlStr);
      parsed = resolveMimeFromFetch(contentType, buffer);
      if (!parsed) {
        return NextResponse.json(
          {
            error: "invalid_image",
            message: "URL did not return a supported image (JPEG, PNG, WebP, or GIF).",
          },
          { status: 400 }
        );
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      if (code === "invalid_url" || code === "invalid_protocol") {
        return NextResponse.json(
          { error: "invalid_image", message: "Invalid image URL." },
          { status: 400 }
        );
      }
      if (code === "invalid_host") {
        return NextResponse.json(
          { error: "invalid_image", message: "This URL is not allowed." },
          { status: 400 }
        );
      }
      if (code === "too_large") {
        return NextResponse.json(
          { error: "invalid_image", message: "Image exceeds 10 MB limit." },
          { status: 400 }
        );
      }
      console.warn("[extension.analyze] image_url fetch failed", { code });
      return NextResponse.json(
        { error: "invalid_image", message: "Could not download the image from this URL." },
        { status: 400 }
      );
    }
  } else {
    const image_base64 = String(rawBase64);
    if (image_base64.length > MAX_BASE64_CHARS) {
      return NextResponse.json(
        { error: "invalid_image", message: "Image exceeds 10 MB limit." },
        { status: 400 }
      );
    }

    parsed = extractBase64AndMime(image_base64);
    if (!parsed) {
      return NextResponse.json(
        { error: "invalid_image", message: "image_base64 must be a valid data URL (jpeg, png, webp, or gif)." },
        { status: 400 }
      );
    }
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "invalid_image", message: "Could not read image bytes." },
      { status: 400 }
    );
  }

  const style: Style =
    typeof rawStyle === "string" && VALID_STYLES.includes(rawStyle as Style)
      ? (rawStyle as Style)
      : "photoreal";

  const locale = normalizeLocale(body.locale);
  const analyzeRequestId = crypto.randomUUID();
  const imageSource: "base64" | "url" = hasUrl ? "url" : "base64";

  logExtensionAnalyzeStart({
    analyzeRequestId,
    style,
    locale,
    imageSource,
    imageMimeType: parsed.mimeType,
    imageBase64Chars: parsed.data.length,
  });

  const supabase = createSupabaseServer();
  const session = await beginExtensionRateLimit(req, supabase, "analyze");
  const preflightCheck = session?.check ?? null;

  if (session && !session.check.allowed) {
    recordExtensionRateLimitEvent(supabase, req, "analyze", session.check, false);
    return NextResponse.json(extensionRateLimit429Body(session.check), { status: 429 });
  }

  // Gemini 2.5 Flash vision call
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[extension.analyze] GEMINI_API_KEY not set");
    recordExtensionRateLimitEvent(supabase, req, "analyze", preflightCheck, false);
    return NextResponse.json(
      { error: "upstream_failed", message: "Service configuration error." },
      { status: 500 }
    );
  }

  let reserved = false;
  let reservedCheck = preflightCheck;
  if (session) {
    const reserveResult = await reserveExtensionRateLimit(supabase, session);
    if (reserveResult && !reserveResult.allowed) {
      recordExtensionRateLimitEvent(supabase, req, "analyze", reserveResult, false);
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
  const systemPromptText = systemPrompt(style, locale);
  const imageSettingsPromise = readImageSettingsFromBase64(parsed.data);
  // gemini-2.5-flash counts thinking tokens against maxOutputTokens. Dynamic thinking
  // was eating ~1900 tokens and truncating the visible response (finishReason MAX_TOKENS,
  // missing sections). Disable thinking for this structured extraction so the full token
  // budget goes to the labeled output, and keep headroom for the 12-section photoreal prompt.
  const generationConfig = {
    temperature: style === "photoreal" ? 0.3 : 0.4,
    maxOutputTokens: style === "photoreal" ? 3584 : 1536,
    thinkingConfig: { thinkingBudget: 0 },
  };
  const geminiBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPromptText },
          { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
        ],
      },
    ],
    generationConfig,
  };

  logExtensionAnalyzeGeminiRequest({
    analyzeRequestId,
    style,
    locale,
    model: GEMINI_MODEL,
    endpointHost: geminiEndpointHost,
    viaProxy,
    systemPrompt: systemPromptText,
    imageMimeType: parsed.mimeType,
    imageBase64Chars: parsed.data.length,
    generationConfig,
    geminiBody,
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
    console.error("[extension.analyze] gemini_fetch_failed", {
      analyzeRequestId,
      message: err instanceof Error ? err.message : String(err),
    });
    extensionLog("gemini.call", {
      endpoint: "analyze",
      analyzeRequestId,
      status: 503,
      latencyMs: Date.now() - geminiStartedAt,
    });
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "analyze",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 503 }
    );
  }

  extensionLog("gemini.call", {
    endpoint: "analyze",
    analyzeRequestId,
    status: geminiRes.status,
    latencyMs: Date.now() - geminiStartedAt,
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    console.error("[extension.analyze] gemini_error_response", {
      analyzeRequestId,
      status: geminiRes.status,
      body: errText.slice(0, 300),
    });
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "analyze",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 502 }
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
      "analyze",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 502 }
    );
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawText) {
    console.error("[extension.analyze] gemini_empty_response", {
      analyzeRequestId,
      data: JSON.stringify(geminiData).slice(0, 300),
    });
    if (session && reserved) {
      await releaseExtensionRateLimitOnFailure(supabase, session);
    }
    recordExtensionRateLimitEvent(
      supabase,
      req,
      "analyze",
      extensionRateLimitCheckFromSession(session, reservedCheck),
      false,
    );
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 502 }
    );
  }

  const promptText =
    style === "photoreal" ? `${rawText}\n\n${CRITICAL_RULES_SINGLE}` : rawText;

  logExtensionAnalyzeGeminiResponse({
    analyzeRequestId,
    style,
    locale,
    model: GEMINI_MODEL,
    httpStatus: geminiRes.status,
    latencyMs: Date.now() - geminiStartedAt,
    geminiData,
    rawText,
    promptText,
    criticalRulesAppended: style === "photoreal",
  });

  const imageSettings = await imageSettingsPromise;

  const rateLimitResult = session
    ? await confirmExtensionRateLimitOnSuccess(supabase, session)
    : null;
  const finalCheck = extensionRateLimitCheckFromSession(session, rateLimitResult ?? reservedCheck);
  recordExtensionRateLimitEvent(
    supabase,
    req,
    "analyze",
    finalCheck,
    rateLimitResult?.allowed ?? false,
  );

  return NextResponse.json({
    prompt: promptText,
    ...(imageSettings ? { imageSettings } : {}),
    ...extensionRateLimitQuotaFields(finalCheck),
  });
}

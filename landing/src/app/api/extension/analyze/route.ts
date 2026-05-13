import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES * (4 / 3)) + 100; // small header overhead
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_DIRECT_BASE_URL = "https://generativelanguage.googleapis.com";

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
const RATE_LIMIT_PER_DAY = 30;
const GEMINI_TIMEOUT_MS = 30_000;

type Style = "photoreal" | "midjourney" | "sd" | "flux";
const VALID_STYLES: Style[] = ["photoreal", "midjourney", "sd", "flux"];

function systemPrompt(style: Style): string {
  const base = `You are an expert AI image analyst. Analyze the provided image and write a detailed generation prompt that would recreate a similar image.`;

  const styleInstructions: Record<Style, string> = {
    photoreal: `${base}

Output a single, detailed prompt for a photorealistic AI image generator (e.g. Midjourney, Stable Diffusion, DALL-E). 
Describe: subject, setting/environment, lighting, camera angle, lens, depth of field, color palette, mood, composition, and any distinctive visual details.
Use photography terminology. Be precise and specific. Output ONLY the prompt text, no explanations or headings.`,

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

  return styleInstructions[style];
}

function parseIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function hashIpForDay(ip: string): string {
  const now = new Date();
  const yyyymmdd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return createHash("sha256").update(`${ip}:${yyyymmdd}`).digest("hex");
}

function dayWindowStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function extractBase64AndMime(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { image_base64?: unknown; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_image", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { image_base64, style: rawStyle } = body;

  if (typeof image_base64 !== "string") {
    return NextResponse.json(
      { error: "invalid_image", message: "image_base64 must be a string." },
      { status: 400 }
    );
  }

  if (image_base64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "invalid_image", message: "Image exceeds 10 MB limit." },
      { status: 400 }
    );
  }

  const parsed = extractBase64AndMime(image_base64);
  if (!parsed) {
    return NextResponse.json(
      { error: "invalid_image", message: "image_base64 must be a valid data URL (jpeg, png, or webp)." },
      { status: 400 }
    );
  }

  const style: Style =
    typeof rawStyle === "string" && VALID_STYLES.includes(rawStyle as Style)
      ? (rawStyle as Style)
      : "photoreal";

  // Rate-limit check
  const ip = parseIp(req);
  const ipHash = hashIpForDay(ip);
  const windowStart = dayWindowStart();

  const supabase = createSupabaseServer();
  let rateLimitResult: { allowed: boolean; count: number } | null = null;

  try {
    const { data, error } = await supabase.rpc("extension_rate_limit_check_and_increment", {
      p_ip_hash: ipHash,
      p_window_start: windowStart,
      p_max_count: RATE_LIMIT_PER_DAY,
    });

    if (error) {
      console.error("[extension.analyze] rate_limit_rpc_error", { message: error.message });
      // Fail open: if rate limit table not available, still allow the request
    } else {
      rateLimitResult = data as { allowed: boolean; count: number };
    }
  } catch (err) {
    console.error("[extension.analyze] rate_limit_threw", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (rateLimitResult && !rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Daily limit reached. Try again in 24 hours." },
      { status: 429 }
    );
  }

  // Gemini 2.5 Flash vision call
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[extension.analyze] GEMINI_API_KEY not set");
    return NextResponse.json(
      { error: "upstream_failed", message: "Service configuration error." },
      { status: 500 }
    );
  }

  const baseUrl = await getGeminiBaseUrl(supabase);
  const geminiUrl = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const geminiBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt(style) },
          { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
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
  } catch (err) {
    console.error("[extension.analyze] gemini_fetch_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 503 }
    );
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    console.error("[extension.analyze] gemini_error_response", {
      status: geminiRes.status,
      body: errText.slice(0, 300),
    });
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
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 502 }
    );
  }

  const promptText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!promptText) {
    console.error("[extension.analyze] gemini_empty_response", { data: JSON.stringify(geminiData).slice(0, 300) });
    return NextResponse.json(
      { error: "upstream_failed", message: "Something went wrong. Please try another image." },
      { status: 502 }
    );
  }

  return NextResponse.json({ prompt: promptText });
}

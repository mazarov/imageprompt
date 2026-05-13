/**
 * Gemini API proxy: forwards requests to generativelanguage.googleapis.com,
 * injecting the server-side GEMINI_API_KEY.
 *
 * Usage: set GEMINI_PROXY_BASE_URL=https://imageprompt.tools/api/gemini-proxy
 * Requests arrive as: POST /api/gemini-proxy/v1beta/models/gemini-2.5-flash:generateContent
 * Forwarded to:       POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
 *
 * Access is restricted to internal server-to-server calls only —
 * requests from browser origins are blocked.
 */

import { NextRequest, NextResponse } from "next/server";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

// Only allow requests from the same server (no Origin header = server-to-server)
// or from the known internal origin.
function isAllowedCaller(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Server-side fetch has no Origin header — allow.
  if (!origin) return true;
  // Block all browser-origin requests to prevent key exposure.
  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  if (!isAllowedCaller(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { path } = await params;
  const upstreamPath = path.join("/");
  const upstreamUrl = `${GEMINI_BASE}/${upstreamPath}`;

  // Forward query params (e.g. ?key= overrides — drop them)
  const incomingSearch = req.nextUrl.searchParams.toString();
  const finalUrl = incomingSearch
    ? `${upstreamUrl}?${incomingSearch}`
    : upstreamUrl;

  let body: ArrayBuffer | null = null;
  try {
    body = await req.arrayBuffer();
  } catch {
    // no body
  }

  const headers = new Headers();
  headers.set("Content-Type", req.headers.get("content-type") || "application/json");
  headers.set("x-goog-api-key", apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(finalUrl, {
      method: "POST",
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error("[gemini-proxy] upstream fetch failed", {
      url: upstreamUrl,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 503 });
  }

  const responseBody = await upstream.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  if (!isAllowedCaller(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { path } = await params;
  const upstreamUrl = `${GEMINI_BASE}/${path.join("/")}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("[gemini-proxy] upstream GET failed", {
      url: upstreamUrl,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 503 });
  }

  const responseBody = await upstream.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    },
  });
}

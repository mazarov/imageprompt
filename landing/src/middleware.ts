import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const DEFAULT_ALLOWED_METHODS = "GET, POST, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";

function parseAllowedOrigins(): string[] {
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(/[,;\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const extIds = [process.env.CHROME_EXTENSION_ID, process.env.CHROME_EXTENSION_ID_LITE]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  const extensionOrigins = extIds.map((id) => `chrome-extension://${id}`);

  return [...fromEnv, ...extensionOrigins].filter(Boolean);
}

function isApiRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith("/api/");
}

function applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  const allowedOrigins = parseAllowedOrigins();
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : null;

  response.headers.set("Vary", "Origin");
  if (allowOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);
  }

  return response;
}

export async function middleware(request: NextRequest) {
  if (isApiRequest(request)) {
    if (request.method === "OPTIONS") {
      return applyCorsHeaders(request, new NextResponse(null, { status: 204 }));
    }
    return applyCorsHeaders(request, NextResponse.next({ request }));
  }

  const response = intlMiddleware(request);

  // next-intl emits a Link header with hreflang for every locale (~52 entries).
  // With long URL paths the header easily exceeds 4 KB — the default
  // proxy_buffer_size in many Nginx/reverse-proxy setups — causing the proxy
  // to hang or return 502.  The same alternates are already rendered as
  // <link rel="alternate"> tags inside <head> by generateMetadata(), so
  // removing the HTTP header has zero SEO impact.
  response.headers.delete("link");

  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|_next|_vercel|embed|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)).*)",
  ],
};

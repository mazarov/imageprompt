import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";
import { CLIENT_SOURCES, resolveClientSource, type ClientSource } from "@/lib/client-source";
import {
  isClientEventName,
  recordClientEvents,
  type ClientEventRow,
} from "@/lib/client-events";
import {
  extensionRateLimitIpHash,
  extensionRateLimitParsedIp,
} from "@/lib/extension-rate-limit-ip";
import { getSupabaseUserForApiRoute } from "@/lib/supabase-route-auth";
import { verifyAppSessionToken } from "@/lib/app-auth-jwt";

export const runtime = "nodejs";

const MAX_EVENTS = 25;
const MAX_STR = 200;
const MAX_DETAIL_CHARS = 2000;

type IncomingEvent = Record<string, unknown>;
type IncomingBody = {
  t?: unknown;
  ctx?: Record<string, unknown>;
  events?: unknown;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

function str(v: unknown, max = MAX_STR): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function isoTs(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sanitizeDetail(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  try {
    const json = JSON.stringify(v);
    if (json.length > MAX_DETAIL_CHARS) return null;
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** sendBeacon ships text/plain; tolerate both that and application/json. */
async function parseBody(req: NextRequest): Promise<IncomingBody | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as IncomingBody;
  } catch {
    return null;
  }
}

async function resolveUserId(req: NextRequest, bodyToken: unknown): Promise<string | null> {
  // Beacon requests cannot set the Authorization header — accept the app JWT in the body.
  const header = await getSupabaseUserForApiRoute(req);
  if (header.user?.id) return header.user.id;

  const token = typeof bodyToken === "string" ? bodyToken.trim() : "";
  if (!token) return null;
  const v = await verifyAppSessionToken(token);
  return v?.sub ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await parseBody(req);
  if (!body || !Array.isArray(body.events) || body.events.length === 0) {
    // Always 204 — telemetry must never surface errors to the client.
    return new NextResponse(null, { status: 204 });
  }

  const ctxIn = body.ctx && typeof body.ctx === "object" ? body.ctx : {};
  const sessionId = str(ctxIn.session_id);
  const locale = str(ctxIn.locale, 32);
  const platform = str(ctxIn.platform, 32);
  const browser = str(ctxIn.browser, 32);
  const extVersion = str(ctxIn.ext_version, 32);

  const bodyClientSource = str(ctxIn.client_source, 32);
  const clientSource: ClientSource =
    bodyClientSource && (CLIENT_SOURCES as readonly string[]).includes(bodyClientSource)
      ? (bodyClientSource as ClientSource)
      : resolveClientSource(req);

  const events: ClientEventRow[] = [];
  for (const raw of (body.events as IncomingEvent[]).slice(0, MAX_EVENTS)) {
    if (!raw || typeof raw !== "object") continue;
    if (!isClientEventName(raw.event)) continue;
    events.push({
      event: raw.event,
      clientTs: isoTs(raw.client_ts),
      mode: str(raw.mode, 32),
      trigger: str(raw.trigger, 48),
      correlationId: str(raw.correlation_id, 64),
      sessionId,
      locale,
      platform,
      browser,
      extVersion,
      style: str(raw.style, 32),
      surface: str(raw.surface, 32),
      errorCode: str(raw.error_code, 64),
      detail: sanitizeDetail(raw.detail),
    });
  }

  if (events.length === 0) return new NextResponse(null, { status: 204 });

  try {
    const supabase = createSupabaseServer();
    const ip = extensionRateLimitParsedIp(req.headers);
    const ipHash = extensionRateLimitIpHash(ip);
    const userId = await resolveUserId(req, body.t);
    await recordClientEvents(supabase, { clientSource, ipHash, userId }, events);
  } catch (e) {
    console.warn("[client.event] route failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return new NextResponse(null, { status: 204 });
}

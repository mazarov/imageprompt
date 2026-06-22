import type { createSupabaseServer } from "@/lib/supabase";
import type { ClientSource } from "@/lib/client-source";

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

export const CLIENT_EVENT_NAMES = [
  "mode_click",
  "request_start_ok",
  "request_start_error",
  "result_shown",
  "error_shown",
  "copy_prompt",
  "image_ingest_error",
] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export function isClientEventName(v: unknown): v is ClientEventName {
  return typeof v === "string" && (CLIENT_EVENT_NAMES as readonly string[]).includes(v);
}

/** One client funnel event, already validated/normalized by the route. */
export type ClientEventRow = {
  event: ClientEventName;
  clientTs?: string | null;
  mode?: string | null;
  trigger?: string | null;
  correlationId?: string | null;
  sessionId?: string | null;
  locale?: string | null;
  platform?: string | null;
  browser?: string | null;
  extVersion?: string | null;
  style?: string | null;
  surface?: string | null;
  errorCode?: string | null;
  detail?: Record<string, unknown> | null;
};

export type ClientEventContext = {
  clientSource: ClientSource;
  ipHash: string;
  userId: string | null;
};

/** Fire-and-forget batch insert for the client funnel. Never throws into the request path. */
export async function recordClientEvents(
  supabase: SupabaseServer,
  ctx: ClientEventContext,
  rows: ClientEventRow[],
): Promise<void> {
  if (!rows.length) return;
  const payload = rows.map((r) => ({
    event: r.event,
    client_ts: r.clientTs ?? null,
    mode: r.mode ?? null,
    trigger: r.trigger ?? null,
    correlation_id: r.correlationId ?? null,
    session_id: r.sessionId ?? null,
    client_source: ctx.clientSource,
    ip_hash: ctx.ipHash,
    user_id: ctx.userId,
    locale: r.locale ?? null,
    platform: r.platform ?? null,
    browser: r.browser ?? null,
    ext_version: r.extVersion ?? null,
    style: r.style ?? null,
    surface: r.surface ?? null,
    error_code: r.errorCode ?? null,
    detail: r.detail ?? null,
  }));

  const { error } = await supabase.from("extension_client_events").insert(payload);
  if (error) console.warn("[client.event] insert failed", { message: error.message });
}

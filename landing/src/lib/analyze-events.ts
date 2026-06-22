import type { createSupabaseServer } from "@/lib/supabase";
import type { ClientSource } from "@/lib/client-source";

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

export type AnalyzeOutcome =
  | "success"
  | "truncated"
  | "rate_limited"
  | "upstream_error"
  | "empty_response"
  | "invalid_request"
  | "config_error";

export type AnalyzeEventInput = {
  endpoint: "analyze" | "remix";
  clientSource: ClientSource;
  ipHash: string;
  userId: string | null;
  allowed: boolean;
  requestOrigin?: string | null;
  /** Real backend result, independent of the rate-limit `allowed` flag. */
  outcome?: AnalyzeOutcome | null;
  errorCode?: string | null;
  finishReason?: string | null;
  truncated?: boolean | null;
  httpStatus?: number | null;
  latencyMs?: number | null;
  locale?: string | null;
  style?: string | null;
  model?: string | null;
  missingSections?: number | null;
  correlationId?: string | null;
};

/** Fire-and-forget fact row for analytics. Never throws into the request path. */
export function recordAnalyzeEvent(supabase: SupabaseServer, e: AnalyzeEventInput): void {
  void supabase
    .from("extension_analyze_events")
    .insert({
      endpoint: e.endpoint,
      client_source: e.clientSource,
      ip_hash: e.ipHash,
      user_id: e.userId,
      allowed: e.allowed,
      request_origin: e.requestOrigin ?? null,
      outcome: e.outcome ?? null,
      error_code: e.errorCode ?? null,
      finish_reason: e.finishReason ?? null,
      truncated: e.truncated ?? false,
      http_status: e.httpStatus ?? null,
      latency_ms: e.latencyMs ?? null,
      locale: e.locale ?? null,
      style: e.style ?? null,
      model: e.model ?? null,
      missing_sections: e.missingSections ?? null,
      correlation_id: e.correlationId ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("[analyze.event] insert failed", { message: error.message });
    });
}

import type { createSupabaseServer } from "@/lib/supabase";
import type { ClientSource } from "@/lib/client-source";

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

export type AnalyzeEventInput = {
  endpoint: "analyze" | "remix";
  clientSource: ClientSource;
  ipHash: string;
  userId: string | null;
  allowed: boolean;
  requestOrigin?: string | null;
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
    })
    .then(({ error }) => {
      if (error) console.warn("[analyze.event] insert failed", { message: error.message });
    });
}

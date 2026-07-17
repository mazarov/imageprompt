import type { NextRequest } from "next/server";
import sharp from "sharp";
import type { ClientSource } from "@/lib/client-source";
import { resolveClientSource } from "@/lib/client-source";
import type { createSupabaseServer } from "@/lib/supabase";

type SupabaseServer = ReturnType<typeof createSupabaseServer>;

export const ANALYZE_HISTORY_BUCKET = "analyze-history";
const MAX_PX = 1024;
const JPEG_QUALITY = 85;
const FALLBACK_MAX_BYTES = 3 * 1024 * 1024;
const CLEANUP_BATCH = 100;
const RETENTION_DAYS = 30;

let lastCleanupUtcDay: string | null = null;

export type AnalyzeHistoryInput = {
  imageBase64: string;
  imageMime?: string | null;
  prompt: string;
  style?: string | null;
  locale?: string | null;
  model?: string | null;
  userId?: string | null;
  ipHash?: string | null;
  correlationId?: string | null;
  clientSource?: ClientSource;
  authenticated?: boolean;
};

export type AnalyzeHistoryRow = {
  id: string;
  created_at: string;
  client_source: string;
  prompt: string;
  style: string | null;
  locale: string | null;
  model: string | null;
  image_path: string | null;
};

function utcDatePathParts(d = new Date()): { yyyy: string; mm: string; dd: string } {
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { yyyy, mm, dd };
}

async function prepareImageBuffer(imageBase64: string): Promise<{ buffer: Buffer; mime: string }> {
  const raw = Buffer.from(imageBase64, "base64");
  try {
    const buffer = await sharp(raw)
      .resize(MAX_PX, MAX_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return { buffer, mime: "image/jpeg" };
  } catch (err) {
    console.warn("[analyze.history] sharp failed, storing raw bytes", {
      message: err instanceof Error ? err.message : String(err),
    });
    const capped =
      raw.length > FALLBACK_MAX_BYTES ? raw.subarray(0, FALLBACK_MAX_BYTES) : raw;
    return { buffer: capped, mime: "application/octet-stream" };
  }
}

async function persistAnalyzeHistory(
  supabase: SupabaseServer,
  input: AnalyzeHistoryInput,
): Promise<void> {
  const prompt = input.prompt.trim();
  if (!prompt || !input.imageBase64) return;

  const id = crypto.randomUUID();
  const { yyyy, mm, dd } = utcDatePathParts();
  const { buffer, mime } = await prepareImageBuffer(input.imageBase64);
  const ext = mime === "image/jpeg" ? "jpg" : "bin";
  const imagePath = `${yyyy}/${mm}/${dd}/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(ANALYZE_HISTORY_BUCKET)
    .upload(imagePath, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    console.warn("[analyze.history] storage upload failed", { message: uploadError.message });
    return;
  }

  const { error: insertError } = await supabase.from("analyze_history").insert({
    id,
    client_source: input.clientSource ?? "unknown",
    image_path: imagePath,
    image_mime: mime,
    prompt,
    style: input.style ?? null,
    locale: input.locale ?? null,
    model: input.model ?? null,
    user_id: input.userId ?? null,
    ip_hash: input.ipHash ?? null,
    correlation_id: input.correlationId ?? null,
  });

  if (insertError) {
    console.warn("[analyze.history] insert failed", { message: insertError.message });
    void supabase.storage.from(ANALYZE_HISTORY_BUCKET).remove([imagePath]);
  }
}

/** Fire-and-forget: store image + prompt after successful analyze. Never throws into the request path. */
export function recordAnalyzeHistory(
  supabase: SupabaseServer,
  req: NextRequest,
  input: Omit<AnalyzeHistoryInput, "clientSource" | "authenticated"> & {
    authenticated?: boolean;
  },
): void {
  const clientSource = resolveClientSource(req, {
    authenticated: input.authenticated ?? false,
  });
  void persistAnalyzeHistory(supabase, {
    ...input,
    clientSource,
  }).catch((err) => {
    console.warn("[analyze.history] persist failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

/** Lazy TTL cleanup: runs at most once per UTC day when admin API is hit. */
export async function maybeCleanupAnalyzeHistory(supabase: SupabaseServer): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastCleanupUtcDay === today) return;
  lastCleanupUtcDay = today;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  try {
    for (;;) {
      const { data: rows, error } = await supabase
        .from("analyze_history")
        .select("id, image_path")
        .lt("created_at", cutoffIso)
        .limit(CLEANUP_BATCH);

      if (error) {
        console.warn("[analyze.history] cleanup select failed", { message: error.message });
        return;
      }
      if (!rows?.length) break;

      const paths = rows.map((r) => r.image_path).filter((p): p is string => Boolean(p));
      if (paths.length) {
        const { error: removeError } = await supabase.storage
          .from(ANALYZE_HISTORY_BUCKET)
          .remove(paths);
        if (removeError) {
          console.warn("[analyze.history] cleanup storage remove failed", {
            message: removeError.message,
          });
        }
      }

      const ids = rows.map((r) => r.id);
      const { error: deleteError } = await supabase.from("analyze_history").delete().in("id", ids);
      if (deleteError) {
        console.warn("[analyze.history] cleanup delete failed", { message: deleteError.message });
        return;
      }

      if (rows.length < CLEANUP_BATCH) break;
    }
  } catch (err) {
    console.warn("[analyze.history] cleanup failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function encodeAnalyzeHistoryCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function parseAnalyzeHistoryCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const createdAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export function parseAnalyzeHistoryLimit(raw: string | null): number {
  const n = Number(raw ?? 30);
  if (!Number.isFinite(n)) return 30;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

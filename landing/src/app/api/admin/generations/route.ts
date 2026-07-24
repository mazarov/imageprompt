import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import {
  encodeAdminGenerationCursor,
  parseAdminGenerationCursor,
  parseAdminGenerationLimit,
  parseAdminGenerationQueueStatus,
  resolveAdminPublicationStatus,
  type AdminGenerationQueueRow,
} from "@/lib/admin-generation-queue";
import { toPromptshotCardUrl } from "@/lib/promptshot-public-url";
import { createSupabaseServer, getStoragePublicUrl } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueueItem = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  prompt: string;
  model: string | null;
  aspectRatio: string | null;
  imageSize: string | null;
  resultUrl: string | null;
  ugcCardId: string | null;
  cardSlug: string | null;
  cardUrl: string | null;
  publicationStatus: ReturnType<typeof resolveAdminPublicationStatus>;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const params = req.nextUrl.searchParams;
  const status = parseAdminGenerationQueueStatus(params.get("status"));
  if (!status) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const cursor = parseAdminGenerationCursor(params.get("cursor"));
  const limit = parseAdminGenerationLimit(params.get("limit"));
  const supabase = createSupabaseServer();
  const startedAt = Date.now();

  const { data, error } = await supabase.rpc("admin_generations_queue", {
    p_status: status,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit,
  });

  if (error) {
    console.error("[admin.generation-queue] rpc_failed", {
      adminEmail: gate.email,
      status,
      message: error.message,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "generation_queue_fetch_failed",
        message:
          "Could not load generation queue. Apply SQL migration docs/sql/14-11-admin-generations-queue-status.sql in Supabase first.",
      },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as AdminGenerationQueueRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const items: QueueItem[] = pageRows.map((row) => {
    let resultUrl: string | null = null;
    if (row.result_storage_bucket && row.result_storage_path) {
      resultUrl = getStoragePublicUrl(row.result_storage_bucket, row.result_storage_path);
    } else {
      console.warn("[admin.generation-queue] result_missing", {
        generationId: row.id,
      });
    }

    const cardSlug = row.card_slug ?? null;
    const publicationStatus = resolveAdminPublicationStatus({
      ugc_card_id: row.ugc_card_id,
      card_exists: row.card_exists,
      is_published: row.is_published,
    });

    return {
      id: row.id,
      createdAt: row.created_at,
      completedAt: row.generation_completed_at,
      prompt: row.prompt_text,
      model: row.model,
      aspectRatio: row.aspect_ratio,
      imageSize: row.image_size,
      resultUrl,
      ugcCardId: row.ugc_card_id,
      cardSlug,
      cardUrl: cardSlug && publicationStatus === "published" ? toPromptshotCardUrl(cardSlug) : null,
      publicationStatus,
    };
  });

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? encodeAdminGenerationCursor(last.created_at, last.id) : null;

  console.log("[admin.generation-queue] fetch", {
    adminEmail: gate.email,
    status,
    limit,
    cursorPresent: Boolean(cursor),
    rowsReturned: items.length,
    hasMore,
    latencyMs: Date.now() - startedAt,
  });

  return NextResponse.json(
    { items, nextCursor, hasMore },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

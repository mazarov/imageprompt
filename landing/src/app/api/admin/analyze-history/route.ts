import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import {
  ANALYZE_HISTORY_BUCKET,
  encodeAnalyzeHistoryCursor,
  maybeCleanupAnalyzeHistory,
  parseAnalyzeHistoryCursor,
  parseAnalyzeHistoryLimit,
  type AnalyzeHistoryRow,
} from "@/lib/analyze-history";
import { toPromptshotCardUrl } from "@/lib/promptshot-public-url";
import { createSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SIGNED_URL_TTL_SEC = 3600;

type HistoryItem = {
  id: string;
  created_at: string;
  client_source: string;
  prompt: string;
  style: string | null;
  locale: string | null;
  model: string | null;
  image_url: string | null;
  is_published: boolean;
  card_url: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = createSupabaseServer();
  await maybeCleanupAnalyzeHistory(supabase);

  const params = req.nextUrl.searchParams;
  const clientSource = (params.get("client_source") || "").trim() || null;
  const cursor = parseAnalyzeHistoryCursor(params.get("cursor"));
  const limit = parseAnalyzeHistoryLimit(params.get("limit"));

  let query = supabase
    .from("analyze_history")
    .select(
      "id, created_at, client_source, prompt, style, locale, model, image_path, ugc_card_id",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (clientSource) {
    query = query.eq("client_source", clientSource);
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin.analyze-history] fetch failed", { message: error.message });
    return NextResponse.json(
      {
        error: "analyze_history_fetch_failed",
        message:
          "Could not load analyze history. Apply SQL migration docs/sql/14-09-analyze-history.sql in Supabase first.",
      },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as AnalyzeHistoryRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const cardIds = pageRows
    .map((row) => row.ugc_card_id)
    .filter((id): id is string => Boolean(id));
  const cardsById = new Map<string, { slug: string | null; is_published: boolean }>();

  if (cardIds.length > 0) {
    const { data: cards, error: cardsError } = await supabase
      .from("prompt_cards")
      .select("id,slug,is_published")
      .in("id", cardIds);
    if (cardsError) {
      console.warn("[admin.analyze-history] publication status fetch failed", {
        message: cardsError.message,
      });
    } else {
      for (const card of cards ?? []) {
        cardsById.set(card.id as string, {
          slug: (card.slug as string | null) ?? null,
          is_published: Boolean(card.is_published),
        });
      }
    }
  }

  const items: HistoryItem[] = await Promise.all(
    pageRows.map(async (row) => {
      let imageUrl: string | null = null;
      if (row.image_path) {
        const { data: signed, error: signError } = await supabase.storage
          .from(ANALYZE_HISTORY_BUCKET)
          .createSignedUrl(row.image_path, SIGNED_URL_TTL_SEC);
        if (signError) {
          console.warn("[admin.analyze-history] signed url failed", {
            id: row.id,
            message: signError.message,
          });
        } else {
          imageUrl = signed?.signedUrl ?? null;
        }
      }
      const card = row.ugc_card_id ? cardsById.get(row.ugc_card_id) : null;
      return {
        id: row.id,
        created_at: row.created_at,
        client_source: row.client_source,
        prompt: row.prompt,
        style: row.style,
        locale: row.locale,
        model: row.model,
        image_url: imageUrl,
        is_published: Boolean(card?.is_published),
        card_url:
          card?.is_published && card.slug ? toPromptshotCardUrl(card.slug) : null,
      };
    }),
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? encodeAnalyzeHistoryCursor(last.created_at, last.id) : null;

  return NextResponse.json({ items, next_cursor: nextCursor });
}

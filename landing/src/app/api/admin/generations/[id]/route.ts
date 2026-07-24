import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import { createSupabaseServer, getStoragePublicUrl } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    const { data: gen, error } = await supabase
      .from("landing_generations")
      .select("*")
      .eq("id", id)
      .eq("client_source", "admin")
      .single();

    if (error || !gen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const status = gen.status as string;
    let progress = 0;
    if (status === "pending") progress = 10;
    else if (status === "processing") progress = 50;
    else if (status === "completed") progress = 100;
    else if (status === "failed") progress = 0;

    const result: Record<string, unknown> = {
      id: gen.id,
      status,
      progress,
      model: gen.model,
      aspectRatio: gen.aspect_ratio,
      createdAt: gen.created_at,
      ugcCardId: gen.ugc_card_id ?? null,
    };

    if (status === "completed" && gen.result_storage_bucket && gen.result_storage_path) {
      result.resultUrl = getStoragePublicUrl(gen.result_storage_bucket, gen.result_storage_path);
      result.completedAt = gen.generation_completed_at;
    }

    if (status === "failed") {
      result.errorType = gen.error_type;
      result.errorMessage = gen.error_message;
      result.creditsRefunded = gen.credits_spent > 0;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin.generations/[id]] error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

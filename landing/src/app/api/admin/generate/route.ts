import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import {
  ADMIN_PINNED_PHOTO_PATH,
  ensureAdminPinnedPhoto,
  resolveInternalSiteOrigin,
} from "@/lib/admin-generation-photo";
import {
  ensureLandingUserStubRow,
  resolveImagepromptUserIdForApiWrite,
} from "@/lib/app-auth-user";
import { createSupabaseServer } from "@/lib/supabase";

function toErrorMeta(err: unknown) {
  if (!(err instanceof Error)) return { message: String(err) };
  return { name: err.name, message: err.message, stack: err.stack };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const gate = await requireAnalyticsAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await req.json();
    const {
      prompt,
      model,
      aspectRatio,
      imageSize,
      count: countRaw,
    } = body as {
      prompt?: string;
      model?: string;
      aspectRatio?: string;
      imageSize?: string;
      count?: number;
    };

    const minPromptLength = 8;
    const validAspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
    const validImageSizes = ["1K", "2K", "4K"];
    const count = Math.min(4, Math.max(1, Number(countRaw) || 1));

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < minPromptLength) {
      return NextResponse.json(
        { error: "validation_error", message: "Промпт должен быть минимум 8 символов" },
        { status: 400 },
      );
    }

    const ar = aspectRatio || "9:16";
    const sz = imageSize || "1K";
    if (!validAspectRatios.includes(ar)) {
      return NextResponse.json(
        { error: "validation_error", message: "Недопустимый формат" },
        { status: 400 },
      );
    }
    if (!validImageSizes.includes(sz)) {
      return NextResponse.json(
        { error: "validation_error", message: "Недопустимое качество" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServer();
    await ensureAdminPinnedPhoto(supabase, req);

    // landing_generations.user_id → landing_users; admin OAuth may lack a billing stub.
    const resolved = await resolveImagepromptUserIdForApiWrite({
      jwtSub: gate.userId,
      jwtEmail: gate.email,
    });
    if (!resolved?.userId) {
      console.error("[admin.generate] admin user not found in imageprompt_users", {
        adminEmail: gate.email,
        jwtSub: gate.userId,
      });
      return NextResponse.json(
        { error: "admin_user_missing", message: "Admin user is not linked in imageprompt_users" },
        { status: 500 },
      );
    }
    const writerUserId = resolved.userId;
    await ensureLandingUserStubRow(writerUserId);

    const { data: landingUser, error: landingUserErr } = await supabase
      .from("landing_users")
      .select("id")
      .eq("id", writerUserId)
      .maybeSingle();
    if (landingUserErr || !landingUser?.id) {
      console.error("[admin.generate] landing_users stub missing after ensure", {
        adminEmail: gate.email,
        writerUserId,
        landingUserErr: landingUserErr?.message ?? null,
      });
      return NextResponse.json(
        {
          error: "landing_user_missing",
          message: "Could not ensure landing_users row for admin",
        },
        { status: 500 },
      );
    }

    const { data: configRows } = await supabase
      .from("landing_generation_config")
      .select("key, value")
      .in("key", ["models", "default_model"]);

    const config: Record<string, string> = {};
    for (const row of configRows || []) {
      config[row.key] = row.value;
    }

    let models: { id: string; cost: number }[] = [];
    try {
      const parsed = JSON.parse(config.models || "[]");
      models = parsed
        .filter((m: { enabled?: boolean }) => m.enabled !== false)
        .map((m: { id: string; cost: number }) => ({ id: m.id, cost: m.cost }));
    } catch {
      models = [
        { id: "gemini-2.5-flash-image", cost: 1 },
        { id: "gemini-3-pro-image-preview", cost: 2 },
        { id: "gemini-3.1-flash-image-preview", cost: 3 },
      ];
    }

    const modelConfig = models.find((m) => m.id === model) || models[0];
    if (!modelConfig) {
      return NextResponse.json(
        { error: "validation_error", message: "Модель не настроена" },
        { status: 400 },
      );
    }

    const promptText = prompt.trim();
    const rows = Array.from({ length: count }, () => ({
      user_id: writerUserId,
      status: "pending",
      card_id: null,
      prompt_text: promptText,
      model: modelConfig.id,
      aspect_ratio: ar,
      image_size: sz,
      credits_spent: 0,
      input_photo_paths: [ADMIN_PINNED_PHOTO_PATH],
      vibe_id: null,
      client_source: "admin",
    }));

    const { data: gens, error: insertError } = await supabase
      .from("landing_generations")
      .insert(rows)
      .select("id");

    if (insertError || !gens?.length) {
      console.error("[admin.generate] insert error", {
        adminEmail: gate.email,
        writerUserId,
        insertError: insertError?.message ?? null,
      });
      return NextResponse.json({ error: "Failed to create generation" }, { status: 500 });
    }

    const baseUrl = resolveInternalSiteOrigin(req);
    for (const gen of gens) {
      fetch(`${baseUrl}/api/generate-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gen.id }),
      })
        .then((res) => {
          console.log("[admin.generate] generate-process kickoff response", {
            generationId: gen.id,
            status: res.status,
            ok: res.ok,
          });
        })
        .catch((err) =>
          console.error("[admin.generate] generate-process kickoff error", {
            generationId: gen.id,
            ...toErrorMeta(err),
          }),
        );
    }

    return NextResponse.json({ ids: gens.map((g) => g.id as string) });
  } catch (err) {
    console.error("[admin.generate] unhandled error", toErrorMeta(err));
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/analytics-admin";
import {
  ensureAdminPinnedPhoto,
  getAdminPinnedPhotoSignedUrl,
  uploadPinnedPhoto,
  validateAndResizeUploadFile,
} from "@/lib/admin-generation-photo";
import { createSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const supabase = createSupabaseServer();
    const storagePath = await ensureAdminPinnedPhoto(supabase, req);
    const photo = await getAdminPinnedPhotoSignedUrl(supabase, storagePath);
    return NextResponse.json(photo);
  } catch (err) {
    console.error("[admin.generation-photo] GET failed", err);
    return NextResponse.json({ error: "pinned_photo_fetch_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAnalyticsAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = await validateAndResizeUploadFile(file);
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_file";
      if (code === "invalid_file_type") {
        return NextResponse.json(
          { error: "validation_error", message: "Use JPEG, PNG or WebP" },
          { status: 400 },
        );
      }
      if (code === "file_too_large") {
        return NextResponse.json(
          { error: "validation_error", message: "File too large. Max 10MB" },
          { status: 400 },
        );
      }
      throw err;
    }

    const supabase = createSupabaseServer();
    const storagePath = await uploadPinnedPhoto(supabase, buffer);
    const photo = await getAdminPinnedPhotoSignedUrl(supabase, storagePath);
    return NextResponse.json(photo);
  } catch (err) {
    console.error("[admin.generation-photo] POST failed", err);
    return NextResponse.json({ error: "pinned_photo_upload_failed" }, { status: 500 });
  }
}

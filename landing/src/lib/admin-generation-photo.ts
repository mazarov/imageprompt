import { readFile } from "fs/promises";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const ADMIN_GENERATION_UPLOAD_BUCKET = "web-generation-uploads";
export const ADMIN_PINNED_PHOTO_PATH = "admin/pinned-reference.jpg";
export const ADMIN_PINNED_PHOTO_SIGNED_URL_TTL_SEC = 3600;

const MAX_SIZE_MB = 10;
const MAX_PX = 2048;
const JPEG_QUALITY = 85;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function resolveInternalSiteOrigin(req?: { headers: { get(name: string): string | null }; nextUrl?: { origin: string } }): string {
  const internalOrigin = (process.env.INTERNAL_GENERATE_PROCESS_ORIGIN || "").replace(/\/+$/, "");
  if (internalOrigin) return internalOrigin;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (req?.headers.get("origin")) return req.headers.get("origin")!.replace(/\/+$/, "");
  if (req?.nextUrl?.origin) return req.nextUrl.origin.replace(/\/+$/, "");
  return "http://localhost:3000";
}

async function readDefaultPinnedPhotoBuffer(): Promise<Buffer> {
  const filePath = path.join(process.cwd(), "public", "admin", "pinned-reference.jpg");
  return readFile(filePath);
}

export async function resizeGenerationPhotoBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(MAX_PX, MAX_PX, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

export async function validateAndResizeUploadFile(file: File): Promise<Buffer> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("invalid_file_type");
  }
  const bytes = await file.arrayBuffer();
  const sizeMb = bytes.byteLength / (1024 * 1024);
  if (sizeMb > MAX_SIZE_MB) {
    throw new Error("file_too_large");
  }
  return resizeGenerationPhotoBuffer(Buffer.from(bytes));
}

async function pinnedPhotoExists(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .download(ADMIN_PINNED_PHOTO_PATH);
  if (error || !data) return false;
  return true;
}

export async function uploadPinnedPhoto(
  supabase: SupabaseClient,
  buffer: Buffer,
): Promise<void> {
  const { error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .upload(ADMIN_PINNED_PHOTO_PATH, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) {
    throw new Error(`pinned_photo_upload_failed:${error.message}`);
  }
}

export async function ensureAdminPinnedPhoto(
  supabase: SupabaseClient,
  req?: { headers: { get(name: string): string | null }; nextUrl?: { origin: string } },
): Promise<void> {
  if (await pinnedPhotoExists(supabase)) return;

  let buffer: Buffer;
  try {
    buffer = await readDefaultPinnedPhotoBuffer();
    buffer = await resizeGenerationPhotoBuffer(buffer);
  } catch (localErr) {
    const origin = resolveInternalSiteOrigin(req);
    const res = await fetch(`${origin}/admin/pinned-reference.jpg`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(
        `pinned_photo_seed_failed:${localErr instanceof Error ? localErr.message : String(localErr)}`,
      );
    }
    buffer = await resizeGenerationPhotoBuffer(Buffer.from(await res.arrayBuffer()));
  }

  await uploadPinnedPhoto(supabase, buffer);
}

export async function getAdminPinnedPhotoSignedUrl(
  supabase: SupabaseClient,
): Promise<{ storagePath: string; signedUrl: string }> {
  const { data, error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .createSignedUrl(ADMIN_PINNED_PHOTO_PATH, ADMIN_PINNED_PHOTO_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(`pinned_photo_signed_url_failed:${error?.message || "unknown"}`);
  }
  return { storagePath: ADMIN_PINNED_PHOTO_PATH, signedUrl: data.signedUrl };
}

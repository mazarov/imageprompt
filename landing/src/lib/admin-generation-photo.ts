import { readFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const ADMIN_GENERATION_UPLOAD_BUCKET = "web-generation-uploads";
export const ADMIN_PINNED_PHOTO_PATH = "admin/pinned-reference/default-v2.jpg";
export const ADMIN_PINNED_PHOTO_SIGNED_URL_TTL_SEC = 3600;
const ADMIN_PINNED_PHOTO_CONFIG_KEY = "admin_generation_photo_path";
const ADMIN_PINNED_PHOTO_PREFIX = "admin/pinned-reference/";

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

function isAllowedPinnedPhotoPath(storagePath: string): boolean {
  return storagePath.startsWith(ADMIN_PINNED_PHOTO_PREFIX) && !storagePath.includes("..");
}

async function getConfiguredPinnedPhotoPath(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("photo_app_config")
    .select("value")
    .eq("key", ADMIN_PINNED_PHOTO_CONFIG_KEY)
    .maybeSingle();
  if (error) {
    throw new Error(`pinned_photo_config_read_failed:${error.message}`);
  }
  const storagePath = String(data?.value || "").trim();
  return storagePath && isAllowedPinnedPhotoPath(storagePath) ? storagePath : null;
}

async function setConfiguredPinnedPhotoPath(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  if (!isAllowedPinnedPhotoPath(storagePath)) {
    throw new Error("invalid_pinned_photo_path");
  }
  const { error } = await supabase
    .from("photo_app_config")
    .upsert(
      { key: ADMIN_PINNED_PHOTO_CONFIG_KEY, value: storagePath },
      { onConflict: "key" },
    );
  if (error) {
    throw new Error(`pinned_photo_config_write_failed:${error.message}`);
  }
}

async function pinnedPhotoExists(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .download(storagePath);
  if (error || !data) return false;
  return true;
}

export async function uploadPinnedPhoto(
  supabase: SupabaseClient,
  buffer: Buffer,
): Promise<string> {
  const storagePath = `${ADMIN_PINNED_PHOTO_PREFIX}${Date.now()}-${randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    throw new Error(`pinned_photo_upload_failed:${error.message}`);
  }
  try {
    await setConfiguredPinnedPhotoPath(supabase, storagePath);
  } catch (err) {
    await supabase.storage.from(ADMIN_GENERATION_UPLOAD_BUCKET).remove([storagePath]);
    throw err;
  }
  return storagePath;
}

export async function ensureAdminPinnedPhoto(
  supabase: SupabaseClient,
  req?: { headers: { get(name: string): string | null }; nextUrl?: { origin: string } },
): Promise<string> {
  const configuredPath = await getConfiguredPinnedPhotoPath(supabase);
  if (configuredPath && (await pinnedPhotoExists(supabase, configuredPath))) {
    return configuredPath;
  }

  if (await pinnedPhotoExists(supabase, ADMIN_PINNED_PHOTO_PATH)) {
    await setConfiguredPinnedPhotoPath(supabase, ADMIN_PINNED_PHOTO_PATH);
    return ADMIN_PINNED_PHOTO_PATH;
  }

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

  const { error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .upload(ADMIN_PINNED_PHOTO_PATH, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    throw new Error(`pinned_photo_seed_failed:${error.message}`);
  }
  await setConfiguredPinnedPhotoPath(supabase, ADMIN_PINNED_PHOTO_PATH);
  return ADMIN_PINNED_PHOTO_PATH;
}

export async function getAdminPinnedPhotoSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ storagePath: string; signedUrl: string }> {
  if (!isAllowedPinnedPhotoPath(storagePath)) {
    throw new Error("invalid_pinned_photo_path");
  }
  const { data, error } = await supabase.storage
    .from(ADMIN_GENERATION_UPLOAD_BUCKET)
    .createSignedUrl(storagePath, ADMIN_PINNED_PHOTO_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(`pinned_photo_signed_url_failed:${error?.message || "unknown"}`);
  }
  return { storagePath, signedUrl: data.signedUrl };
}

export type AdminPublicationStatus =
  | "unpublished"
  | "published"
  | "card_pending"
  | "card_missing";

export type AdminGenerationQueueStatus = "unpublished" | "published" | "all";

export type AdminGenerationQueueRow = {
  id: string;
  created_at: string;
  generation_completed_at: string | null;
  prompt_text: string;
  model: string | null;
  aspect_ratio: string | null;
  image_size: string | null;
  result_storage_bucket: string | null;
  result_storage_path: string | null;
  ugc_card_id: string | null;
  card_exists: boolean;
  is_published: boolean;
  source_channel: string | null;
  card_slug?: string | null;
};

export function encodeAdminGenerationCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function parseAdminGenerationCursor(
  raw: string | null,
): { createdAt: string; id: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const createdAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export function parseAdminGenerationLimit(raw: string | null): number {
  const n = Number(raw ?? 30);
  if (!Number.isFinite(n)) return 30;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

export function parseAdminGenerationQueueStatus(
  raw: string | null,
): AdminGenerationQueueStatus | null {
  const status = (raw || "unpublished").trim().toLowerCase();
  if (status === "unpublished" || status === "published" || status === "all") {
    return status;
  }
  return null;
}

export function resolveAdminPublicationStatus(row: {
  ugc_card_id: string | null;
  card_exists: boolean;
  is_published: boolean;
}): AdminPublicationStatus {
  if (!row.ugc_card_id) return "card_pending";
  if (!row.card_exists) return "card_missing";
  if (row.is_published) return "published";
  return "unpublished";
}

export function adminPublicationStatusLabel(status: AdminPublicationStatus): string {
  switch (status) {
    case "card_pending":
      return "Черновик создаётся";
    case "card_missing":
      return "Черновик не создан";
    case "published":
      return "Опубликовано";
    default:
      return "Не опубликовано";
  }
}

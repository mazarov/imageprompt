const DEFAULT_PROMPTSHOT_PUBLIC_SITE_URL = "https://promptshot.ru";

export function getPromptshotPublicSiteUrl(): string {
  const raw = (process.env.PROMPTSHOT_PUBLIC_SITE_URL || DEFAULT_PROMPTSHOT_PUBLIC_SITE_URL).trim();
  return raw.replace(/\/+$/, "") || DEFAULT_PROMPTSHOT_PUBLIC_SITE_URL;
}

export function toPromptshotCardUrl(slug: string): string {
  return `${getPromptshotPublicSiteUrl()}/p/${encodeURIComponent(slug)}`;
}

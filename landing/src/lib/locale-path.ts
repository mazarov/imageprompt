import { routing } from "@/i18n/routing";

/**
 * Locale-prefixed path for links/canonical/hreflang.
 *
 * Returns slash-free URLs that match the live 200 responses:
 * - root `/` for `en`, `/de` (not `/de/`) for other locales — avoids the
 *   `/xx/` → 308 → `/xx` self-canonical-into-redirect.
 */
export function withLocalePrefix(pathname: string, locale: string): string {
  const raw = pathname.startsWith("/") ? pathname : `/${pathname}`;
  // Normalize a trailing slash (except the bare root) so locale-prefixed
  // roots become `/de` instead of `/de/`.
  const p = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
  if (locale === routing.defaultLocale) return p;
  // Root home for non-default locale must be `/de`, not `/de/`.
  return p === "/" ? `/${locale}` : `/${locale}${p}`;
}

export function absoluteUrl(siteUrl: string, pathname: string, locale: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${withLocalePrefix(pathname, locale)}`;
}

import { routing } from "@/i18n/routing";

/** Path segment for links (e.g. `/promty-dlya-foto-devushki/`). */
export function withLocalePrefix(pathname: string, locale: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (locale === routing.defaultLocale) return p;
  return `/${locale}${p}`;
}

export function absoluteUrl(siteUrl: string, pathname: string, locale: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${withLocalePrefix(pathname, locale)}`;
}

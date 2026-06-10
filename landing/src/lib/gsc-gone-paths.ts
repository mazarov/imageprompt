import gonePaths from "../../data/gsc-gone-paths.json";
import { routing, type AppLocale } from "@/i18n/routing";
import { PRODUCTS } from "@/lib/products/registry";

const GSC_GONE_PATHS = new Set(gonePaths as string[]);

const PRODUCT_SLUGS = new Set(PRODUCTS.map((p) => p.slug));
const SINGLE_CANONICAL_PATHS = new Set(["/privacy", "/welcome"]);

export function normalizePathname(pathname: string): string {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}

export function isGscGonePath(pathname: string): boolean {
  return GSC_GONE_PATHS.has(normalizePathname(pathname));
}

/** Mirrors sitemap.ts entries — never return 410 for these paths. */
export function isProtectedSitemapPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  if (p === "/") return true;

  const segments = p.split("/").filter(Boolean);
  let i = 0;

  if (segments[i] && routing.locales.includes(segments[i] as AppLocale)) {
    i++;
    if (i >= segments.length) return true;
  }

  const rest = segments.slice(i);
  if (rest.length === 0) return true;

  if (rest.length === 1 && SINGLE_CANONICAL_PATHS.has(`/${rest[0]}`)) {
    return true;
  }

  const productSlug = rest[0];
  if (!PRODUCT_SLUGS.has(productSlug as (typeof PRODUCTS)[number]["slug"])) {
    return false;
  }

  return rest.length === 1;
}

function goneCheckCandidates(pathname: string): string[] {
  const normalized = normalizePathname(pathname);
  const candidates = [normalized];

  // next.config redirects `/en/*` → `/*`; check both shapes in one middleware pass.
  if (normalized === "/en") {
    candidates.push("/");
  } else if (normalized.startsWith("/en/")) {
    candidates.push(normalized.slice(3) || "/");
  }

  return candidates;
}

export function shouldReturnGone(pathname: string): boolean {
  for (const candidate of goneCheckCandidates(pathname)) {
    if (isGscGonePath(candidate) && !isProtectedSitemapPath(candidate)) {
      return true;
    }
  }
  return false;
}

export const GONE_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>Страница удалена</title>
</head>
<body>
  <h1>Страница удалена</h1>
  <p>Эта страница больше не доступна.</p>
  <p><a href="https://imageprompt.tools/">На главную</a></p>
</body>
</html>`;

import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/locale-path";
import { PRODUCTS } from "@/lib/products/registry";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

/** Canonical English-only pages: one sitemap entry each, no hreflang cluster. */
const SINGLE_CANONICAL_PATHS = ["/privacy", "/welcome"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales;
  const entries: MetadataRoute.Sitemap = [];

  // Hub (home)
  for (const locale of locales) {
    const url = absoluteUrl(SITE_URL, "/", locale);
    const languages: Record<string, string> = {};
    for (const l of locales) {
      languages[l] = absoluteUrl(SITE_URL, "/", l);
    }
    entries.push({
      url,
      lastModified: new Date(),
      alternates: { languages },
    });
  }

  // Product pages (ai-image-describer + ai-photo-generator)
  for (const product of PRODUCTS) {
    const basePath = `/${product.slug}`;
    for (const locale of locales) {
      const url = absoluteUrl(SITE_URL, basePath, locale);
      const languages: Record<string, string> = {};
      for (const l of locales) {
        languages[l] = absoluteUrl(SITE_URL, basePath, l);
      }
      entries.push({
        url,
        lastModified: new Date(),
        alternates: { languages },
      });
    }
  }

  for (const pathname of SINGLE_CANONICAL_PATHS) {
    entries.push({
      url: absoluteUrl(SITE_URL, pathname, routing.defaultLocale),
      lastModified: new Date(),
    });
  }

  return entries;
}

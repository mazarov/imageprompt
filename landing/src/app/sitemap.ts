import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/locale-path";
import { PRODUCTS } from "@/lib/products/registry";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

// NOTE: `/privacy` and `/welcome` are intentionally excluded — they are
// `noindex` pages, so listing them in the sitemap would trigger
// "Submitted URL marked noindex" warnings in Search Console / Yandex.

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

  // Product pages — only live products (ai-image-describer); coming-soon omitted from sitemap
  for (const product of PRODUCTS.filter((p) => p.status === "live")) {
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

  return entries;
}

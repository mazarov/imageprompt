import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/locale-path";
import { PRODUCTS } from "@/lib/products/registry";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

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

  // Product pages (ai-image-describer + ai-photo-generator) + their sub-routes
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

      // sub-routes (e.g. /welcome for the describer)
      if (product.subRoutes && product.subRoutes.length > 0) {
        for (const sub of product.subRoutes) {
          const subPath = `${basePath}/${sub}`;
          const subUrl = absoluteUrl(SITE_URL, subPath, locale);
          const subLangs: Record<string, string> = {};
          for (const l of locales) {
            subLangs[l] = absoluteUrl(SITE_URL, subPath, l);
          }
          entries.push({
            url: subUrl,
            lastModified: new Date(),
            alternates: { languages: subLangs },
          });
        }
      }
    }
  }

  return entries;
}

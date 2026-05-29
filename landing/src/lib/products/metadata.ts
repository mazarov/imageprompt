import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/locale-path";
import type { ProductDefinition } from "./registry";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

function buildHreflangMap(pathname: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const loc of routing.locales) {
    map[loc] = absoluteUrl(SITE_URL, pathname, loc);
  }
  map["x-default"] = absoluteUrl(SITE_URL, pathname, routing.defaultLocale);
  return map;
}

export async function buildProductMetadata(
  product: ProductDefinition,
  locale: string,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "Meta" });
  const titleAbsolute = t(product.metaTitleKey);
  const description = t(product.metaDescriptionKey);
  const pathname = `/${product.slug}`;
  const canonical = absoluteUrl(SITE_URL, pathname, locale);
  const ogLocale = locale.replace(/-/g, "_");

  return {
    title: { absolute: titleAbsolute },
    description,
    alternates: {
      canonical,
      languages: buildHreflangMap(pathname),
    },
    openGraph: {
      title: titleAbsolute,
      description,
      url: canonical,
      type: "website",
      siteName: "ImagePrompt",
      locale: ogLocale,
    },
    twitter: {
      card: "summary_large_image",
      title: titleAbsolute,
      description,
    },
  };
}

export async function buildHubMetadata(locale: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "Meta" });
  const titleAbsolute = t("hubTitleAbsolute");
  const description = t("hubDescription");
  const canonical = absoluteUrl(SITE_URL, "/", locale);
  const ogLocale = locale.replace(/-/g, "_");

  return {
    title: { absolute: titleAbsolute },
    description,
    alternates: {
      canonical,
      languages: buildHreflangMap("/"),
    },
    openGraph: {
      title: titleAbsolute,
      description,
      url: canonical,
      type: "website",
      siteName: "ImagePrompt",
      locale: ogLocale,
    },
    twitter: {
      card: "summary_large_image",
      title: titleAbsolute,
      description,
    },
  };
}

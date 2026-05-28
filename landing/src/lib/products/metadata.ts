import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { absoluteUrl } from "@/lib/locale-path";
import type { ProductDefinition } from "./registry";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

export async function buildProductMetadata(
  product: ProductDefinition,
  locale: string,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "Meta" });
  const titleAbsolute = t(product.metaTitleKey);
  const description = t(product.metaDescriptionKey);
  const pathname = `/${product.slug}`;
  const canonical = absoluteUrl(SITE_URL, pathname, locale);
  const enOnly = absoluteUrl(SITE_URL, pathname, "en");

  return {
    title: { absolute: titleAbsolute },
    description,
    alternates: {
      canonical,
      languages: { en: enOnly },
    },
    openGraph: {
      title: titleAbsolute,
      description,
      url: canonical,
      type: "website",
      siteName: "ImagePrompt",
      locale: "en",
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
  const enOnly = absoluteUrl(SITE_URL, "/", "en");

  return {
    title: { absolute: titleAbsolute },
    description,
    alternates: {
      canonical,
      languages: { en: enOnly },
    },
    openGraph: {
      title: titleAbsolute,
      description,
      url: canonical,
      type: "website",
      siteName: "ImagePrompt",
      locale: "en",
    },
    twitter: {
      card: "summary_large_image",
      title: titleAbsolute,
      description,
    },
  };
}

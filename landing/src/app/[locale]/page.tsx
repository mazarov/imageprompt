import { cache } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { getTranslations } from "next-intl/server";
import { fetchHomepageSections } from "@/lib/supabase";
import { TAG_REGISTRY } from "@/lib/tag-registry";
import { PageLayout } from "@/components/PageLayout";
import { HomeAnchorSidebar } from "@/components/HomeAnchorSidebar";
import { ExtensionStvFloatingCta } from "@/components/extension-stv/ExtensionStvFloatingCta";
import { ExtensionStvMarketingSections } from "@/components/extension-stv/ExtensionStvMarketingSections";
import { absoluteUrl } from "@/lib/locale-path";

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

const getCachedSections = cache(async () => {
  try {
    return await fetchHomepageSections();
  } catch (err) {
    console.warn("[HomePage] fetchHomepageSections failed:", err);
    return [];
  }
});

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const sections = await getCachedSections();
  const firstPhoto = sections.find((s) => s.cards.length > 0)?.cards[0]?.photoUrl ?? null;

  const titleAbsolute = t("rootTitleAbsolute");
  const description = t("rootDescription");
  const canonical = absoluteUrl(SITE_URL, "/", locale);
  const enUrl = absoluteUrl(SITE_URL, "/", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/", "ru");

  return {
    title: { absolute: titleAbsolute },
    description,
    alternates: {
      canonical,
      languages: { en: enUrl, ru: ruUrl },
    },
    openGraph: {
      title: titleAbsolute,
      description,
      url: canonical,
      type: "website",
      siteName: "image to prompt",
      locale,
      ...(firstPhoto ? { images: [{ url: firstPhoto, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: titleAbsolute,
      description,
      ...(firstPhoto ? { images: [firstPhoto] } : {}),
    },
  };
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const sections = await getCachedSections();
  const homeOgImage = sections.find((s) => s.cards.length > 0)?.cards[0]?.photoUrl ?? null;

  const title = t("rootTitleAbsolute");
  const description = t("rootDescription");
  const homeUrl = absoluteUrl(SITE_URL, "/", locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: homeUrl,
    ...(homeOgImage ? { image: homeOgImage } : {}),
    hasPart: sections
      .filter((s) => s.total_count > 0)
      .slice(0, 50)
      .map((s) => {
        const tag = TAG_REGISTRY.find((t) => t.dimension === s.dimension && t.slug === s.slug);
        if (!tag) return null;
        const label = locale === "ru" ? tag.labelRu : tag.labelEn;
        return {
          "@type": "CollectionPage",
          name: label,
          url: absoluteUrl(SITE_URL, `${tag.urlPath}/`, locale),
        };
      })
      .filter(Boolean),
  };

  return (
    <PageLayout sidebar={<HomeAnchorSidebar />}>
      <div className="pb-32">
        <ExtensionStvMarketingSections />
        <ExtensionStvFloatingCta />
      </div>

      <Script
        id="homepage-json-ld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </PageLayout>
  );
}

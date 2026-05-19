import type { Metadata } from "next";
import Script from "next/script";
import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { HomeAnchorSidebar } from "@/components/HomeAnchorSidebar";
import { ExtensionStvFloatingCta } from "@/components/extension-stv/ExtensionStvFloatingCta";
import { ExtensionStvMarketingSections } from "@/components/extension-stv/ExtensionStvMarketingSections";
import { absoluteUrl } from "@/lib/locale-path";

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });

  const titleAbsolute = t("rootTitleAbsolute");
  const description = t("rootDescription");
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
      siteName: "image to prompt",
      locale: "en",
    },
    twitter: {
      card: "summary_large_image",
      title: titleAbsolute,
      description,
    },
  };
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });

  const title = t("rootTitleAbsolute");
  const description = t("rootDescription");
  const homeUrl = absoluteUrl(SITE_URL, "/", locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description,
    url: homeUrl,
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

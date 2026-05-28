import type { Metadata } from "next";
import Script from "next/script";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { HubHero } from "@/components/hub/HubHero";
import { HubProductGrid } from "@/components/hub/HubProductGrid";
import { absoluteUrl } from "@/lib/locale-path";
import { buildHubMetadata } from "@/lib/products/metadata";

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return buildHubMetadata(locale);
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Meta" });
  const title = t("hubTitleAbsolute");
  const description = t("hubDescription");
  const homeUrl = absoluteUrl(SITE_URL, "/", locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description,
    url: homeUrl,
  };

  return (
    <PageLayout>
      <HubHero />
      <HubProductGrid />

      <Script
        id="homepage-json-ld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </PageLayout>
  );
}

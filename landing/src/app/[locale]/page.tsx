import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { JsonLd } from "@/components/JsonLd";
import { HubHero } from "@/components/hub/HubHero";
import { HubProductGrid } from "@/components/hub/HubProductGrid";
import { buildHubMetadata } from "@/lib/products/metadata";
import { buildHomeGraph } from "@/lib/structured-data";

export const revalidate = 3600;

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

  const jsonLd = buildHomeGraph(title, description);

  return (
    <PageLayout>
      <HubHero />
      <HubProductGrid />

      <JsonLd id="homepage-json-ld" data={jsonLd} />
    </PageLayout>
  );
}

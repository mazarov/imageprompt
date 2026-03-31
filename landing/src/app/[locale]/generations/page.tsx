import { PageLayout } from "@/components/PageLayout";
import { GenerationsContent } from "./GenerationsContent";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { absoluteUrl } from "@/lib/locale-path";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Meta" });
  const canonical = absoluteUrl(SITE_URL, "/generations", locale);
  const enUrl = absoluteUrl(SITE_URL, "/generations", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/generations", "ru");
  return {
    title: t("generationsPageTitle"),
    robots: { index: false, follow: false },
    alternates: {
      canonical,
      languages: { en: enUrl, ru: ruUrl },
    },
  };
}

export default async function GenerationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Common" });
  return (
    <PageLayout>
      <main className="w-full px-5 py-8">
        <h1 className="mb-8 text-2xl font-bold text-zinc-50">{t("myGenerations")}</h1>
        <GenerationsContent />
      </main>
    </PageLayout>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExtensionStvFloatingCta } from "@/components/extension-stv/ExtensionStvFloatingCta";
import { ExtensionStvMarketingFooter } from "@/components/extension-stv/ExtensionStvMarketingFooter";
import { ExtensionStvMarketingHeader } from "@/components/extension-stv/ExtensionStvMarketingHeader";
import { ExtensionStvMarketingSections } from "@/components/extension-stv/ExtensionStvMarketingSections";
import { absoluteUrl } from "@/lib/locale-path";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const title = t("extensionStvTitleAbsolute");
  const description = t("extensionStvDescription");
  const canonical = absoluteUrl(SITE_URL, "/extension-stv", locale);
  const enUrl = absoluteUrl(SITE_URL, "/extension-stv", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/extension-stv", "ru");

  return {
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical,
      languages: { en: enUrl, ru: ruUrl },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: "image to prompt",
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ExtensionStvPage() {
  return (
    <div className="pb-32">
      <ExtensionStvMarketingHeader />
      <ExtensionStvMarketingSections heroVariant="extension" />
      <ExtensionStvMarketingFooter />
      <ExtensionStvFloatingCta />
    </div>
  );
}

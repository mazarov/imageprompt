import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ExtensionStvFloatingCta } from "@/components/extension-stv/ExtensionStvFloatingCta";
import { ExtensionStvMarketingFooter } from "@/components/extension-stv/ExtensionStvMarketingFooter";
import { ExtensionStvMarketingHeader } from "@/components/extension-stv/ExtensionStvMarketingHeader";
import { ExtensionStvPricing } from "@/components/extension-stv/ExtensionStvPricing";
import { STV_FOCUS_RING } from "@/components/extension-stv/stv-marketing-shared";
import { absoluteUrl } from "@/lib/locale-path";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const title = t("extensionStvPricingTitleAbsolute");
  const description = t("extensionStvPricingDescription");
  const canonical = absoluteUrl(SITE_URL, "/extension-stv/pricing", locale);
  const enUrl = absoluteUrl(SITE_URL, "/extension-stv/pricing", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/extension-stv/pricing", "ru");

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

export default async function ExtensionStvPricingPage() {
  return (
    <div className="pb-32">
      <ExtensionStvMarketingHeader />

      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-6">
        <Link
          href="/extension-stv"
          className={`inline-flex text-sm text-zinc-400 transition-colors hover:text-zinc-200 ${STV_FOCUS_RING} rounded-md`}
        >
          ← Image to prompt
        </Link>
      </div>

      <ExtensionStvPricing />
      <ExtensionStvMarketingFooter />
      <ExtensionStvFloatingCta />
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { PrivacyPolicyContent } from "@/components/PrivacyPolicyContent";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/locale-path";

const DOMAIN = "imageprompt.tools";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${DOMAIN}`;
const PRIVACY_LOCALE = routing.defaultLocale;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: PRIVACY_LOCALE, namespace: "Meta" });
  const canonical = absoluteUrl(SITE_URL, "/privacy", PRIVACY_LOCALE);
  return {
    title: t("privacyPageTitle"),
    description: t("privacyPageDescription"),
    robots: "noindex, nofollow",
    alternates: {
      canonical,
    },
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (locale !== PRIVACY_LOCALE) {
    redirect("/privacy");
  }

  setRequestLocale(PRIVACY_LOCALE);
  const t = await getTranslations({ locale: PRIVACY_LOCALE, namespace: "Privacy" });

  return (
    <PageLayout>
      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">{t("title")}</h1>
        <PrivacyPolicyContent />
      </article>
    </PageLayout>
  );
}

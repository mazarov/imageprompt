import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { absoluteUrl } from "@/lib/locale-path";
import { SearchResults } from "./SearchResults";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = q?.trim();
  const t = await getTranslations({ locale, namespace: "Meta" });

  const title = query
    ? t("searchTitleWithQuery", { query })
    : t("searchTitleDefault");
  const description = query
    ? t("searchDescriptionWithQuery", { query })
    : t("searchDescriptionDefault");
  const canonical = absoluteUrl(SITE_URL, "/search", locale);
  const enUrl = absoluteUrl(SITE_URL, "/search", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/search", "ru");

  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: {
      canonical,
      languages: { en: enUrl, ru: ruUrl },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      locale,
    },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const qs = await searchParams;
  const query = qs?.q?.trim() || "";

  return (
    <PageLayout>
      <main className="w-full px-5 py-8">
        <SearchResults initialQuery={query} />
      </main>
    </PageLayout>
  );
}

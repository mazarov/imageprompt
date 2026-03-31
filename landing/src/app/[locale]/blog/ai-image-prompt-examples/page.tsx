import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageLayout } from "@/components/PageLayout";
import { absoluteUrl } from "@/lib/locale-path";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const title = t("blogAiPromptExamplesTitleAbsolute");
  const description = t("blogAiPromptExamplesDescription");
  const canonical = absoluteUrl(SITE_URL, "/blog/ai-image-prompt-examples", locale);
  const enUrl = absoluteUrl(SITE_URL, "/blog/ai-image-prompt-examples", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/blog/ai-image-prompt-examples", "ru");

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
      type: "article",
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

export default async function BlogAiPromptExamplesPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "BlogAiPromptExamples" });

  return (
    <PageLayout>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-400/90">{t("kicker")}</p>
        <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">{t("h1")}</h1>
        <p className="mt-6 text-pretty leading-relaxed text-zinc-300">{t("intro")}</p>

        <h2 className="mt-12 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{t("h2_structure")}</h2>
        <p className="mt-4 text-pretty leading-relaxed text-zinc-400">{t("structureP")}</p>

        <h2 className="mt-10 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{t("h2_beforeAfter")}</h2>
        <p className="mt-4 text-pretty leading-relaxed text-zinc-400">{t("beforeAfterP")}</p>

        <h2 className="mt-10 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{t("h2_tool")}</h2>
        <p className="mt-4 text-pretty leading-relaxed text-zinc-400">{t("toolP")}</p>

        <div className="mt-12 flex flex-wrap gap-3 border-t border-white/[0.08] pt-10">
          <Link
            href="/search"
            className="inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {t("ctaSearch")}
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-500"
          >
            {t("ctaHome")}
          </Link>
        </div>
      </article>
    </PageLayout>
  );
}

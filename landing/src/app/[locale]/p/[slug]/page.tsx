import { cache } from "react";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCardPageData } from "@/lib/supabase";
import { getSupabaseUserFromServerCookies } from "@/lib/supabase-route-auth";
import {
  getFirstTagFromSeoTags,
  findTagBySlug,
  type Dimension,
} from "@/lib/tag-registry";
import { tagDisplayLabel } from "@/lib/tag-label";
import { PageLayout } from "@/components/PageLayout";
import { CardLoadingFallback } from "@/components/CardLoadingFallback";
import { absoluteUrl } from "@/lib/locale-path";

const CardPageClient = nextDynamic(
  () =>
    import("@/components/CardPageClient").then((m) => m.CardPageClient),
  {
    ssr: true,
    loading: () => <CardLoadingFallback />,
  }
);

const getCachedCardPageData = cache((slug: string, viewerUserId: string | null) =>
  getCardPageData(slug, { viewerUserId }),
);

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imageprompt.tools");

const DIMENSIONS: Dimension[] = [
  "audience_tag",
  "style_tag",
  "occasion_tag",
  "object_tag",
];

function getSeoSlugsWithTags(
  seoTags: Record<string, unknown> | null,
  locale: string,
): { slug: string; label: string; href: string | null }[] {
  if (!seoTags) return [];
  const result: { slug: string; label: string; href: string | null }[] = [];
  for (const dim of DIMENSIONS) {
    const arr = (seoTags[dim] || []) as string[];
    for (const slug of arr) {
      const entry = findTagBySlug(dim, slug);
      result.push({
        slug,
        label: entry ? tagDisplayLabel(entry, locale) : slug,
        href: entry ? entry.urlPath : null,
      });
    }
  }
  return result;
}

function buildTitleFromBase(titleBase: string, suffix: string): string {
  const maxLen = 60;
  if (titleBase.length + suffix.length <= maxLen) return `${titleBase}${suffix}`;
  return titleBase.slice(0, maxLen - suffix.length - 1).trim() + suffix;
}

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const viewer = await getSupabaseUserFromServerCookies();
  const data = await getCachedCardPageData(slug, viewer?.id ?? null);
  if (!data) return {};

  const t = await getTranslations({ locale, namespace: "CardSeo" });
  const titleBase = data.title_ru || data.title_en || t("promptFallback");
  const suffix = t("titleSuffix");

  let desc = t("defaultDescription");
  const tags = getSeoSlugsWithTags(data.seo_tags, locale).map((x) => x.label);
  if (data.promptTexts.length > 0) {
    const excerpt = data.promptTexts[0].slice(0, 100).trim();
    const ell = data.promptTexts[0].length > 100 ? "…" : "";
    desc = t("descWithExcerpt", { excerpt, suffix: ell });
  } else if (tags.length > 0) {
    desc = t("descWithTags", {
      title: titleBase,
      tags: tags.join(", "),
    });
  }
  const pageTitle = buildTitleFromBase(titleBase, suffix);
  const isThin =
    data.promptTexts.length === 0 && data.photoUrls.length === 0;

  const isGroupSecondary = data.card_split_index > 0 && !!data.groupFirstSlug;
  const path = isGroupSecondary ? `/p/${data.groupFirstSlug}` : `/p/${data.slug}`;
  const canonical = absoluteUrl(BASE_URL, path, locale);
  const enUrl = absoluteUrl(BASE_URL, path, "en");
  const ruUrl = absoluteUrl(BASE_URL, path, "ru");

  return {
    title: pageTitle,
    description: desc,
    alternates: { canonical, languages: { en: enUrl, ru: ruUrl } },
    openGraph: {
      title: pageTitle,
      description: desc,
      url: canonical,
      type: "article",
      images: data.mainPhotoUrl ? [{ url: data.mainPhotoUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: desc,
      images: data.mainPhotoUrl ? [data.mainPhotoUrl] : undefined,
    },
    robots:
      !data.isPublished
        ? { index: false, follow: false }
        : isThin || isGroupSecondary
          ? "noindex, follow"
          : "index, follow",
  };
}

export default async function CardPage({ params }: Props) {
  const { locale, slug } = await params;
  const viewer = await getSupabaseUserFromServerCookies();
  const data = await getCachedCardPageData(slug, viewer?.id ?? null);

  if (!data) notFound();

  const tCard = await getTranslations({ locale, namespace: "CardSeo" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });

  const title = data.title_ru || data.title_en || tCard("untitled");
  const tagEntries = getSeoSlugsWithTags(data.seo_tags, locale);
  const breadcrumbTag = getFirstTagFromSeoTags(data.seo_tags);

  const creativeWorkLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: title,
    description:
      data.promptTexts[0]?.slice(0, 150) ??
      data.title_ru ??
      tCard("creativeWorkDescFallback"),
    image: data.mainPhotoUrl ?? undefined,
    url: absoluteUrl(BASE_URL, `/p/${data.slug}`, locale),
    datePublished: data.source_date ?? undefined,
    keywords: tagEntries.map((x) => x.label).join(", "),
    isPartOf: {
      "@type": "CollectionPage",
      name: tCard("collectionPartName"),
      url: BASE_URL,
    },
  };

  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: tCommon("home"), item: BASE_URL },
    ...(breadcrumbTag
      ? [
          {
            "@type": "ListItem",
            position: 2,
            name: tagDisplayLabel(breadcrumbTag, locale),
            item: absoluteUrl(BASE_URL, breadcrumbTag.urlPath, locale),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: title,
            item: absoluteUrl(BASE_URL, `/p/${data.slug}`, locale),
          },
        ]
      : [
          {
            "@type": "ListItem",
            position: 2,
            name: title,
            item: absoluteUrl(BASE_URL, `/p/${data.slug}`, locale),
          },
        ]),
  ];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  const safeJson = (obj: object) =>
    JSON.stringify(obj).replace(/</g, "\\u003c");

  return (
    <PageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(creativeWorkLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(breadcrumbLd) }}
      />

      <main className="flex-1 pb-20 lg:pb-0">
        <CardPageClient
          data={data}
          tagEntries={tagEntries}
          breadcrumbTag={breadcrumbTag}
        />
      </main>
    </PageLayout>
  );
}

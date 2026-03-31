import type { MetadataRoute } from "next";
import { getAllTagPaths, findTagBySlug, type Dimension } from "@/lib/tag-registry";
import { getPublishedCardsForSitemap, getIndexableTagCombos } from "@/lib/supabase";
import { isSupabaseServerConfigured } from "@/lib/supabase";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imageprompt.tools");

const DIMENSION_PRIORITY: Dimension[] = [
  "audience_tag",
  "style_tag",
  "occasion_tag",
  "object_tag",
  "doc_task_tag",
];

function comboToPath(
  dim1: string,
  slug1: string,
  dim2: string,
  slug2: string,
): string | null {
  const sorted = [
    { dim: dim1, slug: slug1 },
    { dim: dim2, slug: slug2 },
  ].sort(
    (a, b) =>
      DIMENSION_PRIORITY.indexOf(a.dim as Dimension) -
      DIMENSION_PRIORITY.indexOf(b.dim as Dimension),
  );

  const primary = findTagBySlug(sorted[0].dim as Dimension, sorted[0].slug);
  const secondary = findTagBySlug(sorted[1].dim as Dimension, sorted[1].slug);
  if (!primary || !secondary) return null;

  const base = primary.urlPath.startsWith("/")
    ? primary.urlPath.slice(1)
    : primary.urlPath;
  const secondaryLastSeg = secondary.urlPath.split("/").filter(Boolean).pop();
  if (!secondaryLastSeg) return null;

  return `${base}/${secondaryLastSeg}`;
}

/** Duplicate entries with `/ru` prefix for localized routes (default locale has no prefix). */
function withRuAlternates(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const ru: MetadataRoute.Sitemap = [];
  for (const e of entries) {
    try {
      const u = new URL(e.url);
      if (u.pathname.startsWith("/ru")) continue;
      const ruPath = u.pathname === "/" ? "/ru" : `/ru${u.pathname}`;
      u.pathname = ruPath;
      ru.push({ ...e, url: u.toString() });
    } catch {
      /* ignore bad URLs */
    }
  }
  return [...entries, ...ru];
}

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tagPaths = getAllTagPaths();
  const tagUrls: MetadataRoute.Sitemap = tagPaths.map((path) => ({
    url: `${BASE_URL}/${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  let l2Urls: MetadataRoute.Sitemap = [];
  let cardUrls: MetadataRoute.Sitemap = [];

  if (isSupabaseServerConfigured()) {
    try {
      const combos = await getIndexableTagCombos(6, "ru");
      for (const c of combos) {
        const path = comboToPath(c.dim1, c.slug1, c.dim2, c.slug2);
        if (path) {
          l2Urls.push({
            url: `${BASE_URL}/${path}`,
            lastModified: new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.7,
          });
        }
      }
      const cards = await getPublishedCardsForSitemap();
      cardUrls = cards.map(({ slug, updated_at }) => ({
        url: `${BASE_URL}/p/${slug}`,
        lastModified: new Date(updated_at),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }));
    } catch (err) {
      console.warn("[sitemap] skipped DB-backed URLs:", err);
    }
  }

  const core: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/extension-stv`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/extension-stv/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/blog/ai-image-prompt-examples`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    ...tagUrls,
    ...l2Urls,
    ...cardUrls,
  ];

  return withRuAlternates(core);
}

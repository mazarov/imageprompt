import { createTranslator } from "next-intl";
import { TAG_REGISTRY, findTagByUrlPath, type TagEntry, type Dimension } from "./tag-registry";
import enMessages from "../messages/en.json";
import ruMessages from "../messages/ru.json";

export type MenuItem = {
  label: string;
  href: string;
};

export type MenuItemWithCount = MenuItem & {
  count?: number;
};

export type MenuGroup = {
  title: string;
  items: MenuItem[];
};

export type MenuGroupWithCounts = {
  title: string;
  items: MenuItemWithCount[];
};

export type MenuSection = {
  label: string;
  href?: string;
  dimension: Dimension;
  groups: MenuGroup[];
};

export type MenuSectionWithCounts = {
  label: string;
  href?: string;
  groups: MenuGroupWithCounts[];
};

export type RouteParams = {
  audience_tag?: string;
  style_tag?: string;
  occasion_tag?: string;
  object_tag?: string;
};

function tagItem(slug: string, locale: "en" | "ru"): MenuItem {
  const entry = TAG_REGISTRY.find((t) => t.slug === slug);
  if (!entry) throw new Error(`Tag "${slug}" not found in TAG_REGISTRY`);
  return {
    label: locale === "en" ? entry.labelEn : entry.labelRu,
    href: entry.urlPath + "/",
  };
}

const CURATED_SECTIONS_DATA: {
  sectionKey: string;
  dimension: Dimension;
  groups: { groupKey: string; slugs: string[] }[];
}[] = [
  {
    sectionKey: "people",
    dimension: "audience_tag",
    groups: [
      { groupKey: "basic", slugs: ["devushka", "muzhchina", "para", "vlyublennykh", "semya", "detskie"] },
      { groupKey: "kids", slugs: ["malchik", "devochka", "podrostok", "malysh"] },
      {
        groupKey: "relationships",
        slugs: ["s_mamoy", "s_parnem", "pokoleniy", "s_papoy", "s_muzhem", "s_dochkoy", "s_synom", "s_sestroy", "s_bratom"],
      },
      {
        groupKey: "extended",
        slugs: ["s_podrugoy", "s_drugom", "s_babushkoy", "beremennaya", "s_pitomcem"],
      },
    ],
  },
  {
    sectionKey: "styles",
    dimension: "style_tag",
    groups: [
      {
        groupKey: "core",
        slugs: ["cherno_beloe", "realistichnoe", "portret", "studiynoe", "selfi", "3d", "kollazh"],
      },
      {
        groupKey: "visual",
        slugs: [
          "love_is",
          "gta",
          "delovoe",
          "retro",
          "sovetskoe",
          "fashion",
          "neonovoe",
          "street_style",
          "glyanec",
          "victorias_secret",
        ],
      },
      {
        groupKey: "illustrative",
        slugs: ["anime", "disney", "polaroid", "otkrytka", "piksar", "barbie", "multyashnoe"],
      },
    ],
  },
  {
    sectionKey: "events",
    dimension: "occasion_tag",
    groups: [
      {
        groupKey: "holidays",
        slugs: [
          "den_rozhdeniya",
          "23_fevralya",
          "14_fevralya",
          "8_marta",
          "maslenica",
          "svadba",
          "novyy_god",
          "rozhdestvo",
        ],
      },
    ],
  },
  {
    sectionKey: "scenes",
    dimension: "object_tag",
    groups: [
      {
        groupKey: "objects",
        slugs: [
          "s_mashinoy",
          "s_cvetami",
          "so_znamenitostyu",
          "s_kotom",
          "s_sobakoy",
          "s_tortom",
          "s_koronoy",
          "s_bokalom",
          "s_kofe",
          "so_svechami",
          "s_shuboj",
        ],
      },
      {
        groupKey: "pose",
        slugs: ["v_forme", "v_kostyume", "v_profil", "v_zerkale", "na_chernom_fone", "v_platye", "v_polnyy_rost", "na_avatarku"],
      },
      {
        groupKey: "place",
        slugs: [
          "na_more",
          "v_lesu",
          "v_gorah",
          "zima",
          "vesna",
          "na_ulice",
          "v_mashine",
          "na_yahte",
          "v_restorane",
          "na_kryshe",
          "v_gorode",
          "v_pustyne",
          "pod_vodoy",
        ],
      },
    ],
  },
];

function withAutoGroup(section: MenuSection, locale: "en" | "ru", moreLabel: string): MenuSection {
  const placedSlugs = new Set<string>();
  for (const g of section.groups) {
    for (const item of g.items) {
      const tag = TAG_REGISTRY.find((t) => t.urlPath + "/" === item.href);
      if (tag) placedSlugs.add(tag.slug);
    }
  }

  const unplaced = TAG_REGISTRY.filter((t) => t.dimension === section.dimension && !placedSlugs.has(t.slug)).map((t) =>
    tagItem(t.slug, locale),
  );

  if (unplaced.length === 0) return section;

  return {
    ...section,
    groups: [...section.groups, { title: moreLabel, items: unplaced }],
  };
}

function menuTranslator(locale: "en" | "ru") {
  const messages = locale === "ru" ? ruMessages : enMessages;
  return createTranslator({ locale, messages, namespace: "Menu" });
}

function dimensionsTranslator(locale: "en" | "ru") {
  const messages = locale === "ru" ? ruMessages : enMessages;
  return createTranslator({ locale, messages, namespace: "Dimensions" });
}

export function buildMenuForLocale(locale: "en" | "ru"): MenuSection[] {
  const tMenu = menuTranslator(locale);
  const tDim = dimensionsTranslator(locale);
  const moreLabel = tMenu("more");

  const sections = CURATED_SECTIONS_DATA.map((s) => ({
    label: tMenu(`section.${s.sectionKey}`),
    dimension: s.dimension,
    groups: s.groups.map((g) => ({
      title: tMenu(`group.${g.groupKey}`),
      items: g.slugs.map((slug) => tagItem(slug, locale)),
    })),
  })).map((s) => withAutoGroup(s, locale, moreLabel));

  const coveredDims = new Set(CURATED_SECTIONS_DATA.map((s) => s.dimension));
  const ALL_DIMS: Dimension[] = ["audience_tag", "style_tag", "occasion_tag", "object_tag"];
  for (const dim of ALL_DIMS) {
    if (coveredDims.has(dim)) continue;
    const tags = TAG_REGISTRY.filter((t) => t.dimension === dim);
    if (tags.length === 0) continue;
    sections.push({
      label: tDim(dim),
      dimension: dim,
      groups: [{ title: tMenu("group.all"), items: tags.map((t) => tagItem(t.slug, locale)) }],
    });
  }

  return sections;
}

/** Стабильные href для sitemap / внутренней логики (пути не зависят от языка). */
export const MENU: MenuSection[] = buildMenuForLocale("en");

export function getAllMenuHrefs(): string[] {
  return MENU.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.href)));
}

export function getRouteParamsForHref(href: string): RouteParams | null {
  const tag = findTagByUrlPath(href);
  if (!tag) return null;
  return { [tag.dimension]: tag.slug } as RouteParams;
}

export function getMenuRouteMap(): { href: string; params: RouteParams }[] {
  const hrefs = getAllMenuHrefs();
  const result: { href: string; params: RouteParams }[] = [];
  for (const href of hrefs) {
    const params = getRouteParamsForHref(href);
    if (params) result.push({ href, params });
  }
  return result;
}

export function applyCountsToMenu(
  counts: Record<string, number>,
  locale: "en" | "ru",
): MenuSectionWithCounts[] {
  return buildMenuForLocale(locale).map((section) => ({
    label: section.label,
    href: section.href,
    groups: section.groups.map((group) => ({
      title: group.title,
      items: group.items
        .map((item) => ({ ...item, count: counts[item.href] ?? 0 }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    })),
  }));
}

import type { TagEntry, Dimension } from "./tag-registry";
import { type SeoContent, getSeoContent } from "./seo-content";
import type { ResolvedRoute } from "./route-resolver";

type DimensionPair = `${Dimension}+${Dimension}`;

const PAIR_H1: Partial<Record<DimensionPair, (a: string, b: string) => string>> = {
  "audience_tag+style_tag": (a, b) => `Промты для фото ${a} — ${b}`,
  "audience_tag+occasion_tag": (a, b) => `Промты для фото ${a} на ${b}`,
  "audience_tag+object_tag": (a, b) => `Промты для фото ${a} ${b}`,
  "audience_tag+doc_task_tag": (a, b) => `Промты для фото ${a} ${b}`,
  "style_tag+occasion_tag": (a, b) => `${cap(a)} фото на ${b} — промты`,
  "style_tag+object_tag": (a, b) => `${cap(a)} фото ${b} — промты`,
  "style_tag+doc_task_tag": (a, b) => `${cap(a)} фото ${b} — промты`,
  "occasion_tag+object_tag": (a, b) => `Фото на ${a} ${b} — промты`,
  "occasion_tag+doc_task_tag": (a, b) => `Фото на ${a} ${b} — промты`,
  "object_tag+doc_task_tag": (a, b) => `Фото ${a} ${b} — промты`,
};

const PAIR_META_TITLE: Partial<Record<DimensionPair, (a: string, b: string) => string>> = {
  "audience_tag+style_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "audience_tag+occasion_tag": (a, b) => `${cap(a)} на ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "audience_tag+object_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "audience_tag+doc_task_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "style_tag+occasion_tag": (a, b) => `${cap(a)} фото ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "style_tag+object_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "style_tag+doc_task_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "occasion_tag+object_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "occasion_tag+doc_task_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
  "object_tag+doc_task_tag": (a, b) => `${cap(a)} ${b} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function labelLower(tag: TagEntry): string {
  return tag.labelRu.toLowerCase();
}

function comboDescription(tags: TagEntry[]): string {
  return tags.map((t) => labelLower(t)).join(" + ");
}

function makePairKey(d1: Dimension, d2: Dimension): DimensionPair {
  return `${d1}+${d2}`;
}

function generateH1ForPair(t1: TagEntry, t2: TagEntry): string {
  const key = makePairKey(t1.dimension, t2.dimension);
  const fn = PAIR_H1[key];
  if (fn) return fn(labelLower(t1), labelLower(t2));
  return `Промты для фото: ${labelLower(t1)}, ${labelLower(t2)}`;
}

function generateMetaTitleForPair(t1: TagEntry, t2: TagEntry): string {
  const key = makePairKey(t1.dimension, t2.dimension);
  const fn = PAIR_META_TITLE[key];
  if (fn) return fn(labelLower(t1), labelLower(t2));
  return `${cap(labelLower(t1))} ${labelLower(t2)} — Nano Banana, ИИ-генератор | Бесплатно 2026`;
}

function generateIntro(tags: TagEntry[]): string {
  const desc = comboDescription(tags);
  return (
    `Подборка промтов для создания фото «${desc}» с помощью ИИ. ` +
    `Все промпты проверены в Nano Banana и других нейросетях. ` +
    `Скопируй подходящий промт бесплатно, вставь в генератор и получи результат за секунды. ` +
    `Промпты написаны на русском языке и работают без доработки.`
  );
}

function generateMetaDescription(tags: TagEntry[]): string {
  const desc = comboDescription(tags);
  return `Готовые промты «${desc}» для фото ИИ. Скопируй бесплатно и создай фото за секунды в Nano Banana, Midjourney и других нейросетях.`;
}

function generateFaq(tags: TagEntry[]): { q: string; a: string }[] {
  const desc = comboDescription(tags);
  return [
    {
      q: `Как создать фото «${desc}» в нейросети?`,
      a: `Скопируйте промт с этой страницы, откройте Nano Banana или другую нейросеть и вставьте текст в поле ввода. Загрузите своё фото или запустите генерацию — ИИ создаст результат за секунды.`,
    },
    {
      q: `Какие промты подходят для «${desc}»?`,
      a: `На странице собраны проверенные промты для «${desc}». Все промпты протестированы в Nano Banana, Midjourney и других генераторах.`,
    },
    {
      q: "Промты бесплатные?",
      a: "Да. Все промты на сайте можно копировать и использовать бесплатно в любых ИИ-генераторах.",
    },
  ];
}

const DEFAULT_HOW_TO = [
  "Выбери карточку с подходящим промтом и нажми «Скопировать промт».",
  "Открой нейросеть (Nano Banana, Midjourney, DALL·E, Flux и др.) или фоторедактор с ИИ.",
  "Вставь скопированный текст в поле ввода и добавь своё фото, если нужно.",
  "Получи результат и при необходимости скорректируй промт под свой запрос.",
];

/**
 * Get SEO content for a resolved route.
 * Priority: manual (seo-content.ts for L1) → template (L2/L3).
 */
export function getSeoForRoute(route: ResolvedRoute): SeoContent {
  if (route.level === 1) {
    const manual = getSeoContent(route.primaryTag.slug);
    if (manual) return manual;
    return {
      h1: `Промты для фото: ${route.primaryTag.labelRu}`,
      metaTitle: `Промты для фото ${route.primaryTag.labelRu.toLowerCase()} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
      metaDescription: generateMetaDescription(route.tags),
      intro: generateIntro(route.tags),
      faqItems: generateFaq(route.tags),
      howToSteps: DEFAULT_HOW_TO,
    };
  }

  const sorted = [...route.tags].sort(
    (a, b) =>
      (["audience_tag", "style_tag", "occasion_tag", "object_tag", "doc_task_tag"] as Dimension[]).indexOf(a.dimension) -
      (["audience_tag", "style_tag", "occasion_tag", "object_tag", "doc_task_tag"] as Dimension[]).indexOf(b.dimension),
  );

  if (route.level === 2 && sorted.length === 2) {
    return {
      h1: generateH1ForPair(sorted[0], sorted[1]),
      metaTitle: generateMetaTitleForPair(sorted[0], sorted[1]),
      metaDescription: generateMetaDescription(route.tags),
      intro: generateIntro(route.tags),
      faqItems: generateFaq(route.tags),
      howToSteps: DEFAULT_HOW_TO,
    };
  }

  // L3 (3 tags)
  const desc = comboDescription(sorted);
  return {
    h1: `Промты для фото: ${desc}`,
    metaTitle: `${cap(desc)} — Nano Banana, ИИ-генератор | Бесплатно 2026`,
    metaDescription: generateMetaDescription(route.tags),
    intro: generateIntro(route.tags),
    faqItems: generateFaq(route.tags),
    howToSteps: DEFAULT_HOW_TO,
  };
}

const TAG_ORDER_EN: Dimension[] = [
  "audience_tag",
  "style_tag",
  "occasion_tag",
  "object_tag",
  "doc_task_tag",
];

function labelLowerEn(tag: TagEntry): string {
  return tag.labelEn.toLowerCase();
}

function comboDescriptionEn(tags: TagEntry[]): string {
  return tags.map((t) => labelLowerEn(t)).join(" + ");
}

function generateIntroEn(tags: TagEntry[]): string {
  const desc = comboDescriptionEn(tags);
  return (
    `A curated set of AI image prompts for “${desc}”. ` +
    `Pick a card, copy the text for free, paste into Midjourney, Stable Diffusion, Flux, or your favorite model, and iterate.`
  );
}

function generateMetaDescriptionEn(tags: TagEntry[]): string {
  const desc = comboDescriptionEn(tags);
  return `Ready-to-copy prompts for “${desc}”. Use with Midjourney, Stable Diffusion, Nano Banana, and other image models — free library on ImagePrompt.`;
}

function generateFaqEn(tags: TagEntry[]): { q: string; a: string }[] {
  const desc = comboDescriptionEn(tags);
  return [
    {
      q: `How do I create a “${desc}” image with AI?`,
      a: `Copy a prompt from this page, open your image model, and paste the text. Add a reference photo or run text-to-image, then refine the output.`,
    },
    {
      q: `Which prompts work for “${desc}”?`,
      a: `This page lists library prompts tagged for “${desc}”. Wording is tuned for common generators; you may still adapt tokens per model.`,
    },
    {
      q: "Are the prompts free to use?",
      a: "Yes. You can copy and use prompts from this site for personal or commercial workflows, subject to each model’s terms.",
    },
  ];
}

const DEFAULT_HOW_TO_EN = [
  "Pick a card with a prompt you like and tap Copy prompt.",
  "Open your image model (Midjourney, SD, DALL·E, Nano Banana, Flux, etc.).",
  "Paste the text and add your own photo if you want image-to-image.",
  "Generate, then tweak the prompt if the result needs another pass.",
];

function generateH1ForPairEn(t1: TagEntry, t2: TagEntry): string {
  return `Photo prompts: ${labelLowerEn(t1)} — ${labelLowerEn(t2)}`;
}

/** English programmatic SEO from tag `labelEn` (manual RU entries in seo-content.ts are not reused). */
function getSeoForRouteEn(route: ResolvedRoute): SeoContent {
  if (route.level === 1) {
    const primary = route.primaryTag;
    return {
      h1: `Photo prompts: ${primary.labelEn}`,
      metaTitle: `${primary.labelEn} photo prompts — ImagePrompt`,
      metaDescription: generateMetaDescriptionEn(route.tags),
      intro: generateIntroEn(route.tags),
      faqItems: generateFaqEn(route.tags),
      howToSteps: DEFAULT_HOW_TO_EN,
    };
  }

  const sorted = [...route.tags].sort(
    (a, b) => TAG_ORDER_EN.indexOf(a.dimension) - TAG_ORDER_EN.indexOf(b.dimension),
  );

  if (route.level === 2 && sorted.length === 2) {
    return {
      h1: generateH1ForPairEn(sorted[0], sorted[1]),
      metaTitle: `${sorted[0].labelEn} · ${sorted[1].labelEn} — ImagePrompt`,
      metaDescription: generateMetaDescriptionEn(route.tags),
      intro: generateIntroEn(route.tags),
      faqItems: generateFaqEn(route.tags),
      howToSteps: DEFAULT_HOW_TO_EN,
    };
  }

  const desc = comboDescriptionEn(sorted);
  const titleBits = sorted.map((t) => t.labelEn).join(" · ");
  return {
    h1: `Photo prompts: ${desc}`,
    metaTitle: `${titleBits} — ImagePrompt`,
    metaDescription: generateMetaDescriptionEn(route.tags),
    intro: generateIntroEn(route.tags),
    faqItems: generateFaqEn(route.tags),
    howToSteps: DEFAULT_HOW_TO_EN,
  };
}

export function getSeoForRouteLocalized(route: ResolvedRoute, locale: string): SeoContent {
  if (locale === "en") return getSeoForRouteEn(route);
  return getSeoForRoute(route);
}

/** Общие константы для маркетинговых секций главной и /extension-stv. */
import {
  LANDING_BORDER_SECTION_TOP,
  LANDING_FOCUS_RING_OFFSET,
  LANDING_SECTION_Y,
  LANDING_SURFACE_SECTION_MUTED,
  LANDING_TEXT_SECTION_META,
} from "@/lib/landing-design-tokens";

export const STV_CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_STV_CHROME_STORE_URL ||
  "https://chromewebstore.google.com/detail/ai-image-describer/ccidgdhgephaicccgjenjilnjjippkkl";

export const STV_FOCUS_RING = `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${LANDING_FOCUS_RING_OFFSET}`;

/**
 * Секции: единые отступы и разделители; акцент UI — indigo (CTA, focus, декор интерфейса).
 * Лёгкий двухтоновый radial в hero — только атмосфера, см. ExtensionStvMarketingSections.
 */
export const STV_SECTION_CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
export const STV_SECTION_PY = LANDING_SECTION_Y;
export const STV_SECTION_DIVIDER = LANDING_BORDER_SECTION_TOP;
export const STV_SECTION_BG_MUTED = LANDING_SURFACE_SECTION_MUTED;
export const STV_SECTION_TITLE =
  "text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl text-balance";

export const STV_SECTION_SUBTITLE = `mx-auto mt-3 max-w-2xl ${LANDING_TEXT_SECTION_META}`;

/** Оболочка иллюстрации — индиго, без смешения с violet в UI секций. */
export const STV_VISUAL_SHELL =
  "rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.14] via-indigo-600/[0.07] to-transparent p-6 shadow-[0_24px_80px_-40px_rgba(99,102,241,0.35)] ring-1 ring-inset ring-white/[0.05] sm:p-8";

/** Подпись над моком (eyebrow). */
export const STV_MOCK_EYEBROW =
  "mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-300/80 lg:text-left";

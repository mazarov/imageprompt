/**
 * Единые визуальные токены лендинга (tailwind-классы).
 * Indigo — основной акцент UI; два лёгких radial в hero допускаются отдельно.
 */

export const LANDING_CANVAS_HEX = "#09090b";

export const LANDING_BG_CANVAS = "bg-[#09090b]";
export const LANDING_HEADER_BACKDROP = "bg-[#09090b]/90 backdrop-blur-md";

/** Подложка для focus-ring (всегда дословная строка для Tailwind JIT). */
export const LANDING_FOCUS_RING_OFFSET = "focus-visible:ring-offset-[#09090b]";

export const LANDING_SECTION_Y = "py-14 sm:py-16";
export const LANDING_BORDER_SECTION_TOP = "border-t border-white/[0.06]";
export const LANDING_BORDER_SECTION_BOTTOM = "border-b border-white/[0.06]";

/** Контуры карточек и основных блоков. */
export const LANDING_BORDER_CARD = "border border-white/[0.08]";
/** Вертикальные разделители (sidebar, drawer). */
export const LANDING_BORDER_RAIL = "border-r border-white/[0.08]";
/** Поля форм и вторичных кнопок. */
export const LANDING_BORDER_INPUT = "border border-white/[0.12]";
/** Тонкие inset-кольца (подложки вкладок, мокапы). */
export const LANDING_RING_INSET_SOFT = "ring-1 ring-inset ring-white/[0.06]";
export const LANDING_RING_INSET_SUBTLE = "ring-1 ring-inset ring-white/[0.05]";

/** Кольцо у нейтральных кнопок (zinc-800) без inset. */
export const LANDING_RING_NEUTRAL = "ring-1 ring-white/[0.10]";

/** Muted блок секции под градиентом (как How it works). */
export const LANDING_SURFACE_SECTION_MUTED = "bg-[rgb(9_9_11/0.35)]";

/** Карточки прайсинга / FAQ-панели. */
export const LANDING_SURFACE_CARD = "bg-[rgb(24_24_27/0.4)]";
export const LANDING_SURFACE_CARD_EMPHASIS = "bg-[rgb(24_24_27/0.55)]";

/** Встроенный виджет промо. */
export const LANDING_SURFACE_WIDGET_OUTER = "bg-zinc-950/80";
export const LANDING_SURFACE_WIDGET_TAB_ROW = "bg-zinc-900/60";
export const LANDING_SURFACE_WIDGET_INSET = "bg-zinc-900/50";
export const LANDING_SURFACE_WIDGET_INSET_SOLID = "bg-zinc-900";
export const LANDING_SURFACE_WIDGET_NESTED = "bg-zinc-900/40";
export const LANDING_SURFACE_IMAGE_FRAME = "bg-zinc-950/80";

export const LANDING_SURFACE_FOOTER = "bg-[rgb(9_9_11/0.5)]";

/** Подписи под H2 и узкие подзаголовки секций (meta). */
export const LANDING_TEXT_SECTION_META =
  "text-center text-sm leading-relaxed text-zinc-500 sm:text-[15px] text-pretty";

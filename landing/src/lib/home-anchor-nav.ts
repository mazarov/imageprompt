/** Anchor ids on the home page — must match `id` on section wrappers. */
export const HOME_ANCHOR_NAV = [
  { id: "stv-hero", labelKey: "hero" },
  { id: "stv-problem", labelKey: "problem" },
  { id: "stv-accuracy", labelKey: "accuracy" },
  { id: "stv-reviews", labelKey: "reviews" },
  { id: "stv-how", labelKey: "how" },
  { id: "stv-pricing", labelKey: "pricing" },
  { id: "stv-faq", labelKey: "faq" },
] as const;

export type HomeAnchorId = (typeof HOME_ANCHOR_NAV)[number]["id"];

export const HOME_ANCHOR_IDS = HOME_ANCHOR_NAV.map((n) => n.id);

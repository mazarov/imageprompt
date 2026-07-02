import { getLoadedLocale } from "./i18n.js";

export const LEXYGPT_REF_URL = "https://lexygpt.com/playground/image/nano-banana-pro?ref=T25A8Y_add";
export const LEXYGPT_BTN_LABEL = "Сгенерировать";

export function isLexyGptPromoVisible() {
  return getLoadedLocale() === "ru";
}

/** @param {string} [prompt] */
export async function openLexyGptWithPrompt(prompt) {
  if (prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* noop */
    }
  }
  window.open(LEXYGPT_REF_URL, "_blank", "noopener,noreferrer");
}

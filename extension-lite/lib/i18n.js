/**
 * User-selectable UI locale: loads _locales/<folder>/messages.json (chrome.i18n is browser-only).
 */

import {
  LITE_LOCALE_FOLDERS,
  isValidLocaleFolder,
  matchBrowserLang,
  folderToBcp47,
} from "./locales.js";

export const UI_LANG_STORAGE_KEY = "lite_ui_lang";

/** @type {Record<string, string>} */
let messages = {};
/** @type {string} */
let loadedFolder = "en";
/** @type {Promise<void> | null} */
let initPromise = null;

/** @returns {string} */
export function getBrowserLocaleFolder() {
  const tag =
    (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage?.()) ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en";
  return matchBrowserLang(tag);
}

/** @returns {Promise<string | null>} */
async function readStoredLocaleFolder() {
  try {
    const data = await chrome.storage.local.get(UI_LANG_STORAGE_KEY);
    const stored = data?.[UI_LANG_STORAGE_KEY];
    if (typeof stored === "string" && stored && isValidLocaleFolder(stored)) {
      return stored;
    }
  } catch {
    /* noop */
  }
  return null;
}

/** @returns {Promise<string>} */
export async function resolveUiLocaleFolder() {
  const stored = await readStoredLocaleFolder();
  if (stored) return stored;
  return getBrowserLocaleFolder();
}

/** @param {string} folder */
async function fetchLocaleMessages(folder) {
  const url = chrome.runtime.getURL(`_locales/${folder}/messages.json`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`locale_fetch_failed:${folder}`);
  const raw = await res.json();
  /** @type {Record<string, string>} */
  const flat = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val && typeof val === "object" && typeof val.message === "string") {
      flat[key] = val.message;
    }
  }
  return flat;
}

/** @param {string} folder */
async function loadLocaleBundle(folder) {
  const primary = isValidLocaleFolder(folder) ? folder : "en";
  let primaryMsgs = {};
  let enMsgs = {};

  try {
    primaryMsgs = await fetchLocaleMessages(primary);
  } catch {
    primaryMsgs = {};
  }

  if (primary !== "en") {
    try {
      enMsgs = await fetchLocaleMessages("en");
    } catch {
      enMsgs = {};
    }
  } else {
    enMsgs = primaryMsgs;
  }

  messages = { ...enMsgs, ...primaryMsgs };
  loadedFolder = primary;
}

export function getLoadedLocale() {
  return loadedFolder;
}

export function initI18n() {
  if (!initPromise) {
    initPromise = (async () => {
      const folder = await resolveUiLocaleFolder();
      await loadLocaleBundle(folder);
    })();
  }
  return initPromise;
}

export async function reloadI18n() {
  initPromise = null;
  return initI18n();
}

/** @param {string} folder @param {{ broadcast?: boolean }} [opts] */
export async function setUiLang(folder, opts = {}) {
  const next =
    folder === "auto" || folder === ""
      ? getBrowserLocaleFolder()
      : isValidLocaleFolder(folder)
        ? folder
        : getBrowserLocaleFolder();

  try {
    if (folder === "auto" || folder === "") {
      await chrome.storage.local.remove(UI_LANG_STORAGE_KEY);
    } else if (isValidLocaleFolder(folder)) {
      await chrome.storage.local.set({ [UI_LANG_STORAGE_KEY]: folder });
    }
  } catch {
    /* noop */
  }

  initPromise = null;
  await loadLocaleBundle(next);

  if (opts.broadcast !== false) {
    try {
      chrome.runtime.sendMessage({ type: "LITE_UI_LANG_CHANGED", locale: loadedFolder }).catch(() => {});
    } catch {
      /* noop */
    }
  }

  return loadedFolder;
}

/** @param {string} message @param {string | string[] | undefined} substitutions */
function applySubstitutions(message, substitutions) {
  if (substitutions == null) return message;
  const parts = Array.isArray(substitutions) ? substitutions : [substitutions];
  let out = message;
  parts.forEach((val, i) => {
    out = out.replace(new RegExp(`\\$${i + 1}`, "g"), String(val));
  });
  if (parts.length === 1) {
    out = out.replace(/\$[A-Z][A-Z0-9_]*\$/g, String(parts[0]));
  }
  return out;
}

/** @param {string} key @param {string | string[] | undefined} substitutions */
export function t(key, substitutions) {
  const raw = messages[key];
  if (!raw) return key;
  return applySubstitutions(raw, substitutions);
}

/** @param {number} count */
export function tQuotaRemaining(count) {
  return t("quotaRemaining", String(count));
}

/** @param {number} count */
export function tMinutesAgo(count) {
  return t("timeMinutesAgo", String(count));
}

/** @param {number} count */
export function tHoursAgo(count) {
  return t("timeHoursAgo", String(count));
}

/** @param {number} count */
export function tDaysAgo(count) {
  return t("timeDaysAgo", String(count));
}

/** @param {string} style */
export function tStyleLabel(style) {
  const map = {
    photoreal: "stylePhotoreal",
    midjourney: "styleMidjourney",
    sd: "styleSd",
    flux: "styleFlux",
  };
  return t(map[style] || "stylePhotoreal");
}

export function getUiLanguage() {
  return folderToBcp47(loadedFolder);
}

/** @param {ParentNode} [root] */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.textContent = t(el.dataset.i18n || "");
  });

  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.setAttribute("aria-label", t(el.dataset.i18nAria || ""));
  });

  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.setAttribute("title", t(el.dataset.i18nTitle || ""));
  });

  const html = root instanceof Document ? root.documentElement : document.documentElement;
  if (html) html.lang = getUiLanguage();
}

export { LITE_LOCALE_FOLDERS, localeOptionLabel } from "./locales.js";

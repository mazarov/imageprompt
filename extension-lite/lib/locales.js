/** Chrome _locales folder names (52). */
export const LITE_LOCALE_FOLDERS = [
  "en",
  "am",
  "ar",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "es",
  "es_419",
  "et",
  "fa",
  "fi",
  "fil",
  "fr",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "kn",
  "ko",
  "lt",
  "lv",
  "ml",
  "mr",
  "ms",
  "nl",
  "no",
  "pl",
  "pt_BR",
  "pt_PT",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
  "zh_CN",
  "zh_TW",
];

const FOLDER_SET = new Set(LITE_LOCALE_FOLDERS);

const FOLDER_TO_BCP47 = {
  es_419: "es-419",
  pt_BR: "pt-BR",
  pt_PT: "pt-PT",
  zh_CN: "zh-CN",
  zh_TW: "zh-TW",
};

/** @param {string} folder */
export function folderToBcp47(folder) {
  return FOLDER_TO_BCP47[folder] || folder.replace(/_/g, "-");
}

/** @param {string} folder */
export function localeOptionLabel(folder) {
  const bcp47 = folderToBcp47(folder);
  try {
    const dn = new Intl.DisplayNames([bcp47], { type: "language" });
    const name = dn.of(bcp47);
    if (name) {
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      return `${cap} (${folder === "en" ? "EN" : folder.replace("_", "-")})`;
    }
  } catch {
    /* noop */
  }
  return folder;
}

/** @param {string | undefined | null} tag */
export function matchBrowserLang(tag) {
  if (!tag || typeof tag !== "string") return "en";
  const norm = tag.trim().toLowerCase().replace(/_/g, "-");
  const direct = norm.replace(/-/g, "_");
  if (FOLDER_SET.has(direct)) return direct;

  const aliases = {
    "pt-br": "pt_BR",
    "pt-pt": "pt_PT",
    "zh-cn": "zh_CN",
    "zh-hans": "zh_CN",
    "zh-hans-cn": "zh_CN",
    "zh-tw": "zh_TW",
    "zh-hant": "zh_TW",
    "zh-hant-tw": "zh_TW",
    "es-419": "es_419",
    "es-mx": "es_419",
    "es-us": "es_419",
    "nb": "no",
    "nn": "no",
    "tl": "fil",
  };
  if (aliases[norm]) return aliases[norm];

  const base = norm.split("-")[0];
  if (FOLDER_SET.has(base)) return base;

  if (base === "zh") return norm.includes("tw") || norm.includes("hant") ? "zh_TW" : "zh_CN";
  if (base === "pt") {
    if (norm.includes("br")) return "pt_BR";
    if (norm.endsWith("-pt") || norm === "pt-pt") return "pt_PT";
    return "pt_BR";
  }

  return "en";
}

/** @param {string} folder */
export function isValidLocaleFolder(folder) {
  return FOLDER_SET.has(folder);
}

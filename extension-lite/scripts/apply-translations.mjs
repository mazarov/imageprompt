/**
 * Merges UI translation keys into _locales locale messages.json (preserves store keys).
 *
 * Usage:
 *   node scripts/apply-translations.mjs --input i18n/batches/batch-01.json
 *   node scripts/apply-translations.mjs --seed-en   # seed en from ui-keys.en.json
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = join(__dirname, "..");
const LOCALES_DIR = join(EXT_ROOT, "_locales");
const UI_KEYS = join(EXT_ROOT, "i18n", "ui-keys.en.json");

const STORE_KEYS = new Set(["appName", "shortDesc", "storeDesc"]);

function loadUiKeysFile() {
  return JSON.parse(readFileSync(UI_KEYS, "utf8"));
}

/** @param {Record<string, string>} flatKeys */
function flatToChromeMessages(flatKeys) {
  const uiKeys = loadUiKeysFile();
  const out = {};
  for (const [key, message] of Object.entries(flatKeys)) {
    if (STORE_KEYS.has(key)) continue;
    const template = uiKeys[key];
    if (template?.placeholders) {
      out[key] = { message, placeholders: template.placeholders };
    } else {
      out[key] = { message };
    }
  }
  return out;
}

function mergeIntoLocale(chromeFolder, flatKeys) {
  const path = join(LOCALES_DIR, chromeFolder, "messages.json");
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`);
  }
  const existing = JSON.parse(readFileSync(path, "utf8"));
  const uiMessages = flatToChromeMessages(flatKeys);
  const merged = { ...existing, ...uiMessages };
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

function seedEn() {
  const uiKeys = loadUiKeysFile();
  const flat = {};
  for (const [key, val] of Object.entries(uiKeys)) {
    flat[key] = val.message;
  }
  mergeIntoLocale("en", flat);
  console.log("[seed-en] Wrote UI keys to _locales/en/messages.json");
}

function applyBatch(inputPath) {
  const abs = inputPath.startsWith("/")
    ? inputPath
    : join(EXT_ROOT, inputPath);
  const data = JSON.parse(readFileSync(abs, "utf8"));
  const locales = data.locales || data;
  const list = Array.isArray(locales) ? locales : [locales];

  for (const entry of list) {
    const folder = entry.chromeFolder || entry.locale;
    const keys = entry.keys || entry.translations;
    if (!folder || !keys) {
      throw new Error(`Invalid entry: ${JSON.stringify(entry).slice(0, 80)}`);
    }
    mergeIntoLocale(folder, keys);
    console.log(`[apply] ${folder} — ${Object.keys(keys).length} keys`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let input = null;
  let seedEnFlag = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) input = args[++i];
    if (args[i] === "--seed-en") seedEnFlag = true;
  }
  return { input, seedEnFlag };
}

function main() {
  const { input, seedEnFlag } = parseArgs();
  if (seedEnFlag) {
    seedEn();
    return;
  }
  if (!input) {
    console.error("Usage: node scripts/apply-translations.mjs --input <batch.json>");
    console.error("       node scripts/apply-translations.mjs --seed-en");
    process.exit(1);
  }
  applyBatch(input);
}

main();

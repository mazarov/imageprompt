/**
 * Validates that all _locales have the same UI keys as ui-keys.en.json.
 *
 * Usage: node scripts/validate-ui-locales.mjs
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = join(__dirname, "..");
const LOCALES_DIR = join(EXT_ROOT, "_locales");
const UI_KEYS = join(EXT_ROOT, "i18n", "ui-keys.en.json");

const STORE_KEYS = new Set(["appName", "shortDesc", "storeDesc"]);

function main() {
  const expected = Object.keys(JSON.parse(readFileSync(UI_KEYS, "utf8"))).filter(
    (k) => !STORE_KEYS.has(k),
  );

  const folders = readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let errors = 0;

  for (const folder of folders) {
    const path = join(LOCALES_DIR, folder, "messages.json");
    if (!existsSync(path)) {
      console.error(`[missing] ${folder}/messages.json`);
      errors++;
      continue;
    }
    const data = JSON.parse(readFileSync(path, "utf8"));

    for (const storeKey of STORE_KEYS) {
      if (!data[storeKey]?.message) {
        console.error(`[${folder}] missing store key: ${storeKey}`);
        errors++;
      }
    }

    for (const key of expected) {
      const msg = data[key]?.message;
      if (!msg || typeof msg !== "string" || !msg.trim()) {
        console.error(`[${folder}] missing or empty UI key: ${key}`);
        errors++;
      }
    }

    const uiKeysInFile = Object.keys(data).filter((k) => !STORE_KEYS.has(k));
    const extra = uiKeysInFile.filter((k) => !expected.includes(k));
    if (extra.length) {
      console.warn(`[${folder}] extra UI keys: ${extra.join(", ")}`);
    }
  }

  if (errors) {
    console.error(`\nValidation failed: ${errors} error(s) across ${folders.length} locales.`);
    process.exit(1);
  }

  console.log(
    `OK: ${folders.length} locales, ${expected.length} UI keys each, store keys intact.`,
  );
}

main();

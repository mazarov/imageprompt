/**
 * Lists Chrome locale folders and exports translation batches from ui-keys.en.json.
 *
 * Usage:
 *   node scripts/export-translation-batch.mjs --batch 1
 *   node scripts/export-translation-batch.mjs --list
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = join(__dirname, "..");
const LOCALES_DIR = join(EXT_ROOT, "_locales");
const UI_KEYS = join(EXT_ROOT, "i18n", "ui-keys.en.json");

const STORE_KEYS = new Set(["appName", "shortDesc", "storeDesc"]);
const BATCH_SIZE = 5;

function loadUiKeys() {
  const raw = JSON.parse(readFileSync(UI_KEYS, "utf8"));
  const flat = {};
  for (const [key, val] of Object.entries(raw)) {
    flat[key] = val.message;
  }
  return flat;
}

function listLocaleFolders() {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let batch = null;
  let list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--batch" && args[i + 1]) {
      batch = Number(args[++i]);
    } else if (args[i] === "--list") {
      list = true;
    }
  }
  return { batch, list };
}

function main() {
  const folders = listLocaleFolders();
  const targets = folders.filter((f) => f !== "en");
  const { batch, list } = parseArgs();

  if (list) {
    const totalBatches = Math.ceil(targets.length / BATCH_SIZE);
    console.log(`Locales to translate: ${targets.length} (excluding en)`);
    console.log(`Batch size: ${BATCH_SIZE}, total batches: ${totalBatches}`);
    for (let i = 0; i < totalBatches; i++) {
      const slice = targets.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      console.log(`  batch ${i + 1}: ${slice.join(", ")}`);
    }
    return;
  }

  if (!batch || batch < 1) {
    console.error("Usage: node scripts/export-translation-batch.mjs --batch <n>");
    console.error("       node scripts/export-translation-batch.mjs --list");
    process.exit(1);
  }

  const start = (batch - 1) * BATCH_SIZE;
  const slice = targets.slice(start, start + BATCH_SIZE);
  if (slice.length === 0) {
    console.error(`Batch ${batch} is empty (only ${Math.ceil(targets.length / BATCH_SIZE)} batches).`);
    process.exit(1);
  }

  const sourceKeys = loadUiKeys();
  const output = {
    batch,
    sourceLocale: "en",
    instructions:
      "Translate each locale's keys from English. Keep $COUNT$, ⌘V, Ctrl+V, Midjourney, Stable Diffusion, Flux, Google, imageprompt.tools unchanged.",
    locales: slice.map((chromeFolder) => ({
      chromeFolder,
      keys: { ...sourceKeys },
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();

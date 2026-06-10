#!/usr/bin/env node
/**
 * Import GSC coverage xlsx → data/gsc-gone-paths.json
 *
 * Usage:
 *   node scripts/import-gsc-gone-urls.mjs /path/to/coverage.xlsx
 *   npm run import:gsc-gone -- /path/to/coverage.xlsx
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../data/gsc-gone-paths.json");

/** Paths that overlap sitemap and must never receive 410. */
const EXCLUDED_PATHS = new Set(["/", "/ru"]);

function normalizePathname(pathname) {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/import-gsc-gone-urls.mjs <path-to-coverage.xlsx>");
    process.exit(1);
  }

  const absInput = resolve(inputPath);
  const workbook = XLSX.readFile(absInput);
  const sheet = workbook.Sheets["Таблица"];
  if (!sheet) {
    console.error('Sheet "Таблица" not found. Available:', workbook.SheetNames.join(", "));
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const paths = new Set();
  let skippedExcluded = 0;
  let skippedInvalid = 0;

  for (let i = 1; i < rows.length; i++) {
    const url = rows[i]?.[0];
    if (!url || typeof url !== "string") continue;

    let pathname;
    try {
      pathname = normalizePathname(new URL(url.trim()).pathname);
    } catch {
      skippedInvalid++;
      continue;
    }

    if (EXCLUDED_PATHS.has(pathname)) {
      skippedExcluded++;
      continue;
    }

    paths.add(pathname);
  }

  const sorted = [...paths].sort();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  console.log(`Wrote ${sorted.length} paths → ${OUT_PATH}`);
  console.log(`Skipped (sitemap overlap): ${skippedExcluded}`);
  console.log(`Skipped (invalid URL): ${skippedInvalid}`);
  console.log("Sample paths:");
  for (const p of sorted.slice(0, 5)) {
    console.log(`  ${p}`);
  }
}

main();

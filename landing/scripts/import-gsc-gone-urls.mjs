#!/usr/bin/env node
/**
 * Import GSC coverage export → data/gsc-gone-paths.json
 *
 * Usage:
 *   node scripts/import-gsc-gone-urls.mjs /path/to/coverage.xlsx
 *   node scripts/import-gsc-gone-urls.mjs /path/to/Table.csv
 *   npm run import:gsc-gone -- /path/to/Table.csv
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../data/gsc-gone-paths.json");

/** Keep in sync with landing/src/i18n/routing.ts */
const LOCALES = [
  "en", "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "es", "es-419", "et", "fa", "fi",
  "fil", "fr", "gu", "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt", "lv", "ml", "mr",
  "ms", "nl", "no", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sl", "sr", "sv", "sw", "ta", "te",
  "th", "tr", "uk", "vi", "zh-CN", "zh-TW",
];

/** Keep in sync with landing/src/lib/products/registry.ts */
const PRODUCT_SLUGS = new Set(["ai-image-describer", "ai-photo-generator"]);
const SINGLE_CANONICAL_PATHS = new Set(["/privacy", "/welcome"]);

function normalizePathname(pathname) {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}

/** Strip /en prefix — next.config redirects /en/* → /* */
function canonicalGonePath(pathname) {
  const p = normalizePathname(pathname);
  if (p === "/en") return "/";
  if (p.startsWith("/en/")) return normalizePathname(p.slice(3) || "/");
  return p;
}

/** Mirrors landing/src/lib/gsc-gone-paths.ts isProtectedSitemapPath */
function isProtectedSitemapPath(pathname) {
  const p = normalizePathname(pathname);
  if (p === "/") return true;

  const segments = p.split("/").filter(Boolean);
  let i = 0;

  if (segments[i] && LOCALES.includes(segments[i])) {
    i++;
    if (i >= segments.length) return true;
  }

  const rest = segments.slice(i);
  if (rest.length === 0) return true;

  if (rest.length === 1 && SINGLE_CANONICAL_PATHS.has(`/${rest[0]}`)) {
    return true;
  }

  const productSlug = rest[0];
  if (!PRODUCT_SLUGS.has(productSlug)) {
    return false;
  }

  return rest.length === 1;
}

function loadExistingPaths() {
  if (!existsSync(OUT_PATH)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(OUT_PATH, "utf8")).map(canonicalGonePath));
  } catch {
    return new Set();
  }
}

function readUrlsFromCsv(absInput) {
  const text = readFileSync(absInput, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const urls = [];
  for (let i = 1; i < lines.length; i++) {
    const url = lines[i]?.split(",")[0]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}

function readUrlsFromXlsx(absInput) {
  const workbook = XLSX.readFile(absInput);
  const sheet = workbook.Sheets["Таблица"];
  if (!sheet) {
    console.error('Sheet "Таблица" not found. Available:', workbook.SheetNames.join(", "));
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const urls = [];
  for (let i = 1; i < rows.length; i++) {
    const url = rows[i]?.[0];
    if (url && typeof url === "string") urls.push(url.trim());
  }
  return urls;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/import-gsc-gone-urls.mjs <path-to-coverage.xlsx|Table.csv>");
    process.exit(1);
  }

  const absInput = resolve(inputPath);
  const ext = extname(absInput).toLowerCase();
  const urls =
    ext === ".csv" ? readUrlsFromCsv(absInput) : readUrlsFromXlsx(absInput);

  const paths = loadExistingPaths();
  let skippedSitemap = 0;
  let skippedInvalid = 0;
  let added = 0;

  for (const url of urls) {
    let pathname;
    try {
      pathname = canonicalGonePath(new URL(url).pathname);
    } catch {
      skippedInvalid++;
      continue;
    }

    if (isProtectedSitemapPath(pathname)) {
      skippedSitemap++;
      continue;
    }

    if (!paths.has(pathname)) {
      paths.add(pathname);
      added++;
    }
  }

  const sorted = [...new Set([...paths].map(canonicalGonePath))].sort();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  console.log(`Input URLs: ${urls.length}`);
  console.log(`Added: ${added}`);
  console.log(`Total paths: ${sorted.length} → ${OUT_PATH}`);
  console.log(`Skipped (sitemap overlap): ${skippedSitemap}`);
  console.log(`Skipped (invalid URL): ${skippedInvalid}`);
  console.log("Sample paths:");
  for (const p of sorted.slice(0, 5)) {
    console.log(`  ${p}`);
  }
}

main();

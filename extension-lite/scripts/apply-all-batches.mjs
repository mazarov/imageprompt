/**
 * Applies all batch JSON files from i18n/batches/ and optional i18n/translations/*.json
 *
 * Usage:
 *   node scripts/apply-all-batches.mjs
 *   node scripts/apply-all-batches.mjs --dir i18n/translations
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = join(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  let dir = join(EXT_ROOT, "i18n", "batches");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      dir = args[i + 1].startsWith("/") ? args[i + 1] : join(EXT_ROOT, args[++i]);
    }
  }
  return { dir };
}

function main() {
  const { dir } = parseArgs();
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    const input = join(dir, file);
    console.log(`\n==> ${file}`);
    const res = spawnSync(
      process.execPath,
      [join(__dirname, "apply-translations.mjs"), "--input", input],
      { stdio: "inherit", cwd: EXT_ROOT },
    );
    if (res.status !== 0) process.exit(res.status || 1);
  }

  console.log(`\nApplied ${files.length} file(s) from ${dir}`);
}

main();

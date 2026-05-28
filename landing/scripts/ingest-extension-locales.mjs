/**
 * Ingests Chrome Web Store locales (52) from extension-lite/_locales/
 * into landing/src/messages/<bcp47>.json (hyphenated codes).
 *
 * - Bases every new locale on en.json (full English fallback for untranslated site sections).
 * - Overrides only the keys needed for the /ai-image-describer product page:
 *   Meta.aiImageDescriber*, Marketing.heroExtension, Marketing.how.*, Marketing.faq.*
 * - Uses appName as H1/hero title, shortDesc for page title/meta and hero subtitle.
 * - Parses storeDesc into subtitleP1, promptSnippet, 5 steps, 7 Q/A pairs using
 *   structure markers (🖼️, Nano Banana, 🚀, ❓) + multilingual prefix stripping.
 *
 * Run from landing/ dir:
 *   node scripts/ingest-extension-locales.mjs
 *
 * After run: update src/i18n/routing.ts with the printed locale list (if new locales added).
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANDING_ROOT = join(__dirname, "..");
const EXT_ROOT = join(LANDING_ROOT, "..", "extension-lite", "_locales");
const MESSAGES_DIR = join(LANDING_ROOT, "src", "messages");
const EN_BASE = join(MESSAGES_DIR, "en.json");

const CHROME_TO_WEB = {
  es_419: "es-419",
  pt_BR: "pt-BR",
  pt_PT: "pt-PT",
  zh_CN: "zh-CN",
  zh_TW: "zh-TW",
};

function normalize(folder) {
  return CHROME_TO_WEB[folder] || folder;
}

function stripQ(s) {
  return s
    .replace(/^(Q|问|В|س|Q：|问：|В:|س:|Q\?|Вопрос|प्रश्न)\s*[:：]?\s*/i, "")
    .trim();
}

function stripA(s) {
  return s
    .replace(/^(A|答|О|ج|A：|答：|О:|ج:|A\?|Ответ|उत्तर)\s*[:：]?\s*/i, "")
    .trim();
}

function parseStoreDesc(desc) {
  const lines = desc
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const introLine = lines.find((l) => l.startsWith("🖼️")) || lines[0] || "";
  const subtitleP1 = introLine.replace(/^🖼️\s*/, "").trim();

  const promptLine = lines.find((l) => l.includes("Nano Banana")) || "";
  const promptSnippet = promptLine.trim();

  const howIdx = lines.findIndex((l) => l.includes("🚀"));
  let howTitle = "How it works";
  let steps = ["", "", "", "", ""];
  if (howIdx !== -1) {
    const header = lines[howIdx];
    howTitle = header.replace(/^🚀\s*/, "").trim() || "How it works";
    const rawSteps = lines.slice(howIdx + 1, howIdx + 6);
    steps = rawSteps.map((s) =>
      s.replace(/^\d+️⃣\s*|\d+\.\s*/, "").trim()
    );
    while (steps.length < 5) steps.push("");
  }

  const faqIdx = lines.findIndex((l) => l.includes("❓"));
  let faqTitle = "Frequently asked questions";
  const faqs = [];
  if (faqIdx !== -1) {
    const header = lines[faqIdx];
    faqTitle = header.replace(/^❓\s*/, "").trim() || "Frequently asked questions";
    const after = lines.slice(faqIdx + 1);
    for (let i = 0; i + 1 < after.length && faqs.length < 7; i += 2) {
      const q = stripQ(after[i] || "");
      const a = stripA(after[i + 1] || "");
      if (q && a) faqs.push({ q, a });
    }
  }

  return { subtitleP1, promptSnippet, howTitle, steps, faqTitle, faqs };
}

function main() {
  if (!existsSync(EN_BASE)) {
    throw new Error("Base en.json not found at " + EN_BASE);
  }
  const baseEn = JSON.parse(readFileSync(EN_BASE, "utf8"));

  const folders = readdirSync(EXT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(`[ingest] Found ${folders.length} Chrome locale folders`);

  const webLocales = [];
  let written = 0;

  for (const folder of folders) {
    const web = normalize(folder);
    webLocales.push(web);

    const extPath = join(EXT_ROOT, folder, "messages.json");
    if (!existsSync(extPath)) continue;

    const ext = JSON.parse(readFileSync(extPath, "utf8"));
    const appName = ext.appName?.message || "AI Image Describer";
    const shortDesc = ext.shortDesc?.message || "";
    const storeDesc = ext.storeDesc?.message || "";

    const parsed = parseStoreDesc(storeDesc);

    if (web === "en" || web === "ru") {
      console.log(`[skip] ${web} — curated full-site translations exist`);
      continue;
    }

    const messages = JSON.parse(JSON.stringify(baseEn));

    if (!messages.Meta) messages.Meta = {};
    messages.Meta.aiImageDescriberTitleAbsolute =
      shortDesc || `${appName} | ImagePrompt`;
    messages.Meta.aiImageDescriberDescription = shortDesc || appName;

    if (!messages.Marketing) messages.Marketing = {};
    messages.Marketing.heroExtension = {
      title: appName,
      subtitle: shortDesc || appName,
    };

    messages.Marketing.how = {
      title: parsed.howTitle,
      subtitleP1: parsed.subtitleP1,
      promptSnippet: parsed.promptSnippet,
      step1: parsed.steps[0] || "",
      step2: parsed.steps[1] || "",
      step3: parsed.steps[2] || "",
      step4: parsed.steps[3] || "",
      step5: parsed.steps[4] || "",
    };

    const faqBase = messages.Marketing.faq || {};
    const faq = {
      title: parsed.faqTitle,
      subtitle:
        faqBase.subtitle ||
        baseEn.Marketing?.faq?.subtitle ||
        "AI Image Describer in the browser—plain answers about image-to-prompt and the Chrome extension.",
    };
    for (let i = 0; i < 7; i++) {
      const p = parsed.faqs[i] || { q: "", a: "" };
      faq[`q${i + 1}`] = p.q;
      faq[`a${i + 1}`] = p.a;
    }
    messages.Marketing.faq = faq;

    if (!existsSync(MESSAGES_DIR)) {
      mkdirSync(MESSAGES_DIR, { recursive: true });
    }
    const outPath = join(MESSAGES_DIR, `${web}.json`);
    writeFileSync(outPath, JSON.stringify(messages, null, 2) + "\n", "utf8");
    written++;
    console.log(
      `[written] ${web}.json (from ${folder}) — "${appName.substring(0, 28)}..."`
    );
  }

  const unique = Array.from(new Set(webLocales)).sort((a, b) =>
    a.localeCompare(b, "en")
  );
  const finalList = ["en", ...unique.filter((l) => l !== "en")];

  console.log(`\n[done] Wrote ${written} new message files.`);
  console.log("\n=== COPY THIS into src/i18n/routing.ts locales array ===\n");
  console.log(JSON.stringify(finalList, null, 2));
  console.log(`\nTotal locales: ${finalList.length}`);
}

main();
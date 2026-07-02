/** Known prompt section headings from analyze output. */
export const PROMPT_SECTION_LABELS = [
  "Visual Hook",
  "Scene",
  "Genre",
  "Pose",
  "Lighting",
  "Camera",
  "Mood",
  "Color",
  "Clothing",
  "Makeup",
  "Composition",
  "Avoid",
  "CRITICAL RULES",
];

const SECTION_DEFS = [
  { key: "visual_hook", label: "Visual Hook", chipLabel: "Hook", re: /^Visual Hook\s*:\s*$/i },
  { key: "scene", label: "Scene", chipLabel: "Scene", re: /^Scene\s*:\s*$/i },
  { key: "genre", label: "Genre", chipLabel: "Genre", re: /^Genre\s*:\s*$/i },
  { key: "pose", label: "Pose", chipLabel: "Pose", re: /^Pose\s*:\s*$/i },
  { key: "lighting", label: "Lighting", chipLabel: "Lighting", re: /^Lighting\s*:\s*$/i },
  { key: "camera", label: "Camera", chipLabel: "Camera", re: /^Camera\s*:\s*$/i },
  { key: "mood", label: "Mood", chipLabel: "Mood", re: /^Mood\s*:\s*$/i },
  { key: "color", label: "Color", chipLabel: "Color", re: /^Color\s*:\s*$/i },
  { key: "clothing", label: "Clothing", chipLabel: "Clothing", re: /^Clothing\s*:\s*$/i },
  { key: "makeup", label: "Makeup", chipLabel: "Makeup", re: /^Makeup\s*:\s*$/i },
  { key: "composition", label: "Composition", chipLabel: "Composition", re: /^Composition\s*:\s*$/i },
  { key: "avoid", label: "Avoid", chipLabel: "Avoid", re: /^Avoid\s*:\s*$/i },
  {
    key: "critical_rules",
    label: "CRITICAL RULES",
    chipLabel: "Rules",
    re: /^CRITICAL RULES\s*:?\s*$/i,
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Put glued section headings (e.g. "sexual.Color:") on their own line. */
export function normalizePromptLayout(prompt) {
  if (typeof prompt !== "string" || !prompt) return prompt;

  let result = prompt;
  const defs = [...SECTION_DEFS].sort((a, b) => b.label.length - a.label.length);

  for (const def of defs) {
    if (def.key === "critical_rules") {
      result = result.replace(/([^\n\r])(CRITICAL RULES)(?=\s*(?:\n|$|-))/gi, "$1\n$2");
      continue;
    }
    const re = new RegExp(`([^\\n\\r])(${escapeRegex(def.label)}\\s*:)`, "gi");
    result = result.replace(re, "$1\n$2");
  }

  return result.replace(/\n{3,}/g, "\n\n");
}

function foreignHeadingPattern(def) {
  if (def.key === "critical_rules") return "CRITICAL RULES\\s*:?";
  return `${escapeRegex(def.label)}\\s*:`;
}

/** Drop text from Gemini that leaked into the next section. */
export function trimTrailingForeignHeadings(sectionLabel, sectionText) {
  const text = String(sectionText ?? "");
  if (!text.trim()) return text;

  let cutAt = text.length;
  for (const def of SECTION_DEFS) {
    if (def.label === sectionLabel) continue;
    const pattern = foreignHeadingPattern(def);
    const re = new RegExp(`(?:^|[\\n\\r]|(?<=[.!?]))\\s*(${pattern})`, "im");
    const match = re.exec(text);
    if (!match || match.index <= 0 || match.index >= cutAt) continue;
    cutAt = match.index;
  }

  return cutAt < text.length ? text.slice(0, cutAt).trimEnd() : text;
}

function lineStartIndex(prompt, lineIndex) {
  if (lineIndex <= 0) return 0;
  let idx = 0;
  for (let i = 0; i < lineIndex; i++) {
    const next = prompt.indexOf("\n", idx);
    if (next === -1) return prompt.length;
    idx = next + 1;
  }
  return idx;
}

function lineEndIndex(prompt, lineIndex) {
  const start = lineStartIndex(prompt, lineIndex);
  const next = prompt.indexOf("\n", start);
  return next === -1 ? prompt.length : next;
}

/**
 * @returns {Array<{ key: string; label: string; chipLabel: string; heading: string; body: string; text: string; start: number; end: number }>}
 */
export function parsePromptSections(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    return [];
  }

  const normalized = normalizePromptLayout(prompt);
  const lines = normalized.split("\n");
  /** @type {Array<{ def: typeof SECTION_DEFS[number]; lineIndex: number; headingLine: string }>} */
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    for (const def of SECTION_DEFS) {
      if (def.re.test(trimmed)) {
        matches.push({ def, lineIndex: i, headingLine: lines[i] });
        break;
      }
    }
  }

  if (matches.length === 0) {
    const text = normalized.trim();
    return [
      {
        key: "prompt",
        label: "Prompt",
        chipLabel: "Prompt",
        heading: "",
        body: text,
        text,
        start: 0,
        end: normalized.length,
      },
    ];
  }

  return matches.map((match, index) => {
    const start = lineStartIndex(normalized, match.lineIndex);
    const nextMatch = matches[index + 1];
    const end = nextMatch ? lineStartIndex(normalized, nextMatch.lineIndex) : normalized.length;
    const text = normalized.slice(start, end);
    const headingEnd = lineEndIndex(normalized, match.lineIndex);
    const heading = normalized.slice(start, headingEnd).trimEnd();
    const bodyStart =
      headingEnd + (headingEnd < normalized.length && normalized[headingEnd] === "\n" ? 1 : 0);
    const body = normalized.slice(bodyStart, end).replace(/^\n+/, "").replace(/\s+$/, "");

    return {
      key: match.def.key,
      label: match.def.label,
      chipLabel: match.def.chipLabel,
      heading,
      body,
      text,
      start,
      end,
      lineIndex: match.lineIndex,
    };
  });
}

export function replacePromptSection(prompt, sectionKey, updatedSectionText) {
  const layoutPrompt = normalizePromptLayout(prompt);
  const sections = parsePromptSections(layoutPrompt);
  const section = sections.find((s) => s.key === sectionKey);
  if (!section) return layoutPrompt;

  let replacement = trimTrailingForeignHeadings(section.label, String(updatedSectionText ?? ""));
  replacement = replacement.trimEnd();
  if (!replacement.trim()) return layoutPrompt;

  const before = layoutPrompt.slice(0, section.start);
  const after = layoutPrompt.slice(section.end);

  if (after.length > 0 && !replacement.endsWith("\n")) {
    replacement += "\n";
  }

  return normalizePromptLayout(before + replacement + after);
}

export function normalizeSectionText(label, sectionText, originalHeading = "") {
  let trimmed = trimTrailingForeignHeadings(label, String(sectionText ?? "").trim());
  if (!trimmed) return trimmed;

  if (label === "CRITICAL RULES") {
    if (/^CRITICAL RULES/i.test(trimmed)) return trimmed;
    const heading = originalHeading || "CRITICAL RULES";
    return `${heading}\n${trimmed}`;
  }

  const labelRe = new RegExp(`^${escapeRegex(label)}\\s*:`, "i");
  if (labelRe.test(trimmed)) return trimmed;

  const heading = originalHeading || `${label}:`;
  return `${heading}\n${trimmed}`;
}

export function sectionKeyForLabel(label) {
  const norm = String(label ?? "").trim().toLowerCase();
  const def = SECTION_DEFS.find((d) => d.label.toLowerCase() === norm);
  if (def) return def.key;
  if (norm === "prompt") return "prompt";
  return null;
}

/**
 * Apply model-produced section changes to a full prompt.
 * @param {string} prompt
 * @param {Array<{label?: unknown; text?: unknown}>} changes
 * @returns {string} full reconstructed prompt
 */
export function applyPromptSectionChanges(prompt, changes) {
  if (typeof prompt !== "string" || !Array.isArray(changes)) return prompt;

  let result = normalizePromptLayout(prompt);
  const parsed = parsePromptSections(result);
  const isFallback = parsed.length === 1 && parsed[0].key === "prompt";

  for (const change of changes) {
    const label = String(change?.label ?? "").trim();
    const text = String(change?.text ?? "").trim();
    if (!text) continue;

    if (isFallback) {
      result = normalizePromptLayout(text);
      break;
    }

    const key = sectionKeyForLabel(label);
    if (!key) continue;
    const current = parsePromptSections(result).find((s) => s.key === key);
    if (!current) continue;
    const normalized = normalizeSectionText(current.label, text, current.heading || "");
    result = replacePromptSection(result, key, normalized);
  }

  return result;
}

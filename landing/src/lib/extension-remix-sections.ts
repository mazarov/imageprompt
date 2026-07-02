import { SECTION_SPEC_ORDER } from "@/lib/extension-prompt-sections";

export type ParsedPromptSection = {
  label: string;
  text: string;
};

const AUTO_CLASSIFIER_FALLBACK_LABELS = [
  "Visual Hook",
  "Mood",
  "Color",
  "Composition",
  "Avoid",
] as const;

const SECTION_DEFS: Array<{ label: string; re: RegExp }> = [
  ...SECTION_SPEC_ORDER.map((label) => ({
    label,
    re: new RegExp(`^${escapeRegex(label)}\\s*:$`, "i"),
  })),
  { label: "CRITICAL RULES", re: /^CRITICAL RULES\s*:?\s*$/i },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineStartIndex(prompt: string, lineIndex: number): number {
  if (lineIndex <= 0) return 0;
  let idx = 0;
  for (let i = 0; i < lineIndex; i++) {
    const next = prompt.indexOf("\n", idx);
    if (next === -1) return prompt.length;
    idx = next + 1;
  }
  return idx;
}

/** Put glued section headings on their own line. */
export function normalizePromptLayout(prompt: string): string {
  if (!prompt) return prompt;

  let result = prompt;
  const defs = [...SECTION_DEFS].sort((a, b) => b.label.length - a.label.length);

  for (const def of defs) {
    if (def.label === "CRITICAL RULES") {
      result = result.replace(/([^\n\r])(CRITICAL RULES)(?=\s*(?:\n|$|-))/gi, "$1\n$2");
      continue;
    }
    const re = new RegExp(`([^\\n\\r])(${escapeRegex(def.label)}\\s*:)`, "gi");
    result = result.replace(re, "$1\n$2");
  }

  return result.replace(/\n{3,}/g, "\n\n");
}

/** Parse structured prompt sections for server-side auto remix slicing. */
export function parseAvailablePromptSections(originalPrompt: string): ParsedPromptSection[] {
  const normalized = normalizePromptLayout(String(originalPrompt ?? "").trim());
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const matches: Array<{ label: string; lineIndex: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    for (const def of SECTION_DEFS) {
      if (def.re.test(trimmed)) {
        matches.push({ label: def.label, lineIndex: i });
        break;
      }
    }
  }

  if (matches.length === 0) {
    return [{ label: "Prompt", text: normalized }];
  }

  return matches.map((match, index) => {
    const start = lineStartIndex(normalized, match.lineIndex);
    const nextMatch = matches[index + 1];
    const end = nextMatch ? lineStartIndex(normalized, nextMatch.lineIndex) : normalized.length;
    return {
      label: match.label,
      text: normalized.slice(start, end).trimEnd(),
    };
  });
}

/** Keep prompt order while selecting only requested labels. */
export function pickSectionsByLabels(
  sections: ParsedPromptSection[],
  labels: string[],
): ParsedPromptSection[] {
  const wanted = new Set(labels.map((label) => label.trim()).filter(Boolean));
  if (wanted.size === 0) return [];
  return sections.filter((section) => wanted.has(section.label));
}

export function availableSectionLabels(sections: ParsedPromptSection[]): string[] {
  return sections.map((section) => section.label);
}

export function normalizeClassifierLabels(
  labels: unknown,
  availableLabels: string[],
): string[] {
  const available = new Set(availableLabels);
  const parsed = Array.isArray(labels)
    ? labels
        .map((label) => String(label ?? "").trim())
        .filter((label) => label && available.has(label))
    : [];

  const unique = [...new Set(parsed)];
  if (unique.length > 0) {
    if (available.has("Avoid") && !unique.includes("Avoid")) {
      unique.push("Avoid");
    }
    return unique;
  }

  const fallback = AUTO_CLASSIFIER_FALLBACK_LABELS.filter((label) => available.has(label));
  if (fallback.length > 0) return [...fallback];
  return availableLabels.length > 0 ? [availableLabels[0]] : [];
}

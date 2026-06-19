/** Known prompt section headings from analyze output. */
export const PROMPT_SECTION_LABELS = [
  "Scene",
  "Genre",
  "Pose",
  "Lighting",
  "Camera",
  "Mood",
  "Color",
  "Clothing",
  "Composition",
  "CRITICAL RULES",
];

const SECTION_DEFS = [
  { key: "scene", label: "Scene", chipLabel: "Scene", re: /^Scene\s*:\s*$/i },
  { key: "genre", label: "Genre", chipLabel: "Genre", re: /^Genre\s*:\s*$/i },
  { key: "pose", label: "Pose", chipLabel: "Pose", re: /^Pose\s*:\s*$/i },
  { key: "lighting", label: "Lighting", chipLabel: "Lighting", re: /^Lighting\s*:\s*$/i },
  { key: "camera", label: "Camera", chipLabel: "Camera", re: /^Camera\s*:\s*$/i },
  { key: "mood", label: "Mood", chipLabel: "Mood", re: /^Mood\s*:\s*$/i },
  { key: "color", label: "Color", chipLabel: "Color", re: /^Color\s*:\s*$/i },
  { key: "clothing", label: "Clothing", chipLabel: "Clothing", re: /^Clothing\s*:\s*$/i },
  { key: "composition", label: "Composition", chipLabel: "Composition", re: /^Composition\s*:\s*$/i },
  {
    key: "critical_rules",
    label: "CRITICAL RULES",
    chipLabel: "Rules",
    re: /^CRITICAL RULES\s*:?\s*$/i,
  },
];

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

  const lines = prompt.split("\n");
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
    const text = prompt.trim();
    return [
      {
        key: "prompt",
        label: "Prompt",
        chipLabel: "Prompt",
        heading: "",
        body: text,
        text,
        start: 0,
        end: prompt.length,
      },
    ];
  }

  return matches.map((match, index) => {
    const start = lineStartIndex(prompt, match.lineIndex);
    const nextMatch = matches[index + 1];
    const end = nextMatch ? lineStartIndex(prompt, nextMatch.lineIndex) : prompt.length;
    const text = prompt.slice(start, end);
    const headingEnd = lineEndIndex(prompt, match.lineIndex);
    const heading = prompt.slice(start, headingEnd).trimEnd();
    const bodyStart = headingEnd + (headingEnd < prompt.length && prompt[headingEnd] === "\n" ? 1 : 0);
    const body = prompt.slice(bodyStart, end).replace(/^\n+/, "").replace(/\s+$/, "");

    return {
      key: match.def.key,
      label: match.def.label,
      chipLabel: match.def.chipLabel,
      heading,
      body,
      text,
      start,
      end,
    };
  });
}

export function replacePromptSection(prompt, sectionKey, updatedSectionText) {
  const sections = parsePromptSections(prompt);
  const section = sections.find((s) => s.key === sectionKey);
  if (!section) return prompt;

  const replacement = String(updatedSectionText ?? "");
  if (!replacement.trim()) return prompt;
  return prompt.slice(0, section.start) + replacement + prompt.slice(section.end);
}

export function normalizeSectionText(label, sectionText, originalHeading = "") {
  const trimmed = String(sectionText ?? "").trim();
  if (!trimmed) return trimmed;

  if (label === "CRITICAL RULES") {
    if (/^CRITICAL RULES/i.test(trimmed)) return trimmed;
    const heading = originalHeading || "CRITICAL RULES";
    return `${heading}\n${trimmed}`;
  }

  const labelRe = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i");
  if (labelRe.test(trimmed)) return trimmed;

  const heading = originalHeading || `${label}:`;
  return `${heading}\n${trimmed}`;
}

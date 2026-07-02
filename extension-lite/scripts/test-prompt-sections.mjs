/**
 * Manual checks for prompt section parser (Visual Hook, Avoid, backward compatibility).
 * Run: node extension-lite/scripts/test-prompt-sections.mjs
 */
import {
  parsePromptSections,
  replacePromptSection,
  normalizePromptLayout,
  applyPromptSectionChanges,
} from "../lib/prompt-sections.js";

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log("OK:", message);
}

const fullPrompt = normalizePromptLayout(`Visual Hook:
A sharp red suit against a cold gray studio creates a dominant high-fashion presence.

Scene:
The subject stands in a minimalist gray studio.

Genre:
Fashion editorial

Pose:
Upright stance, hands in pockets.

Lighting:
Soft key light from camera-right.

Camera:
85mm full-body, eye level.

Mood:
Cold confidence.

Color:
Red, black, and neutral gray.

Clothing:
Bright red tailored suit.

Makeup:
Matte lips, graphic liner.

Composition:
Centered full-body vertical framing.

Avoid:
3D render look, cartoon styling, distorted hands, plastic skin.

CRITICAL RULES
- Preserve identity.
- Photorealistic output.`);

const sections = parsePromptSections(fullPrompt);
assert(sections.length === 13, "full prompt has 13 sections");
assert(sections[0].key === "visual_hook", "first section is Visual Hook");
assert(sections[0].chipLabel === "Hook", "Visual Hook chip label");
assert(sections[11].key === "avoid", "Avoid section parsed");
assert(sections[12].key === "critical_rules", "CRITICAL RULES last");

const legacyPrompt = normalizePromptLayout(`Scene:
A person in a room.

Genre:
Portrait

Pose:
Standing.

Lighting:
Soft window light.

Camera:
50mm waist-up.

Mood:
Calm.

Color:
Warm neutrals.

Clothing:
White shirt.

Makeup:
Natural.

Composition:
Centered.

CRITICAL RULES
- Preserve identity.`);

const legacySections = parsePromptSections(legacyPrompt);
assert(legacySections.length === 11, "legacy prompt without new sections still parses");
assert(!legacySections.some((s) => s.key === "visual_hook"), "legacy prompt has no Visual Hook");

const replaced = replacePromptSection(
  fullPrompt,
  "visual_hook",
  "Visual Hook:\nA softer romantic hook with warm backlight and flowing fabric.",
);
assert(replaced.includes("A softer romantic hook"), "Visual Hook replacement applied");
assert(replaced.includes("The subject stands in a minimalist gray studio"), "Scene unchanged after hook remix");

const avoidReplaced = replacePromptSection(
  fullPrompt,
  "avoid",
  "Avoid:\nflat lighting, cheap jewelry, messy hair.",
);
assert(avoidReplaced.includes("flat lighting, cheap jewelry"), "Avoid replacement applied");
assert(avoidReplaced.includes("CRITICAL RULES"), "CRITICAL RULES preserved after Avoid remix");

const fallback = parsePromptSections("Just a plain paragraph without headings.");
assert(fallback.length === 1 && fallback[0].key === "prompt", "fallback Prompt section");

const multiChanged = applyPromptSectionChanges(fullPrompt, [
  { label: "Scene", text: "Scene:\nThe subject stands in a plain white void." },
  { label: "Mood", text: "Mood:\nBright and cheerful." },
]);
assert(multiChanged.includes("plain white void"), "Scene change applied in multi-change remix");
assert(multiChanged.includes("Bright and cheerful"), "Mood change applied in multi-change remix");
assert(multiChanged.includes("Fashion editorial"), "Genre unchanged after multi-change remix");

const unknownLabel = applyPromptSectionChanges(fullPrompt, [
  { label: "UnknownSection", text: "UnknownSection:\nShould be ignored." },
  { label: "Color", text: "Color:\nCool blue tones only." },
]);
assert(!unknownLabel.includes("Should be ignored"), "unknown label skipped");
assert(unknownLabel.includes("Cool blue tones only"), "valid label still applied with unknown present");

const fallbackChanged = applyPromptSectionChanges("Just a plain paragraph without headings.", [
  { label: "Prompt", text: "Rewritten plain prompt text." },
]);
assert(
  fallbackChanged.trim() === "Rewritten plain prompt text.",
  "fallback prompt replaced entirely",
);

if (process.exitCode !== 1) {
  console.log("\nAll prompt-section checks passed.");
}

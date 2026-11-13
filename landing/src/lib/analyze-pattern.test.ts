import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYZE_PATTERNS,
  buildLockedExtractPrompt,
  buildRouterExtractPrompt,
  forbiddenHeadingsFor,
  isAnalyzePatternRouterFlagValue,
  normalizeAnalyzeLayout,
  parseAnalyzeDraft,
  patternCriticalRules,
  sectionOrderFor,
  validateAnalyzeDraft,
} from "./analyze-pattern";

function sectionBody(headings: readonly string[], overrides: Record<string, string> = {}): string {
  return headings
    .map((heading) => `${heading}:\n${overrides[heading] ?? `${heading} body`}`)
    .join("\n\n");
}

test("each pattern forbids only headings outside its own order", () => {
  for (const pattern of ANALYZE_PATTERNS) {
    const allowed = new Set(sectionOrderFor(pattern));
    assert.ok(allowed.size > 3);
    for (const heading of forbiddenHeadingsFor(pattern)) {
      assert.equal(allowed.has(heading), false, `${pattern} forbids ${heading}`);
    }
  }
  assert.ok(forbiddenHeadingsFor("object").includes("Pose"));
  assert.ok(forbiddenHeadingsFor("layout").includes("Camera"));
  assert.ok(forbiddenHeadingsFor("scene").includes("Makeup"));
});

test("router prompt names every pattern and does not ban appearance", () => {
  const ru = buildRouterExtractPrompt("ru");
  assert.match(ru, /Write every section body in Russian/);
  for (const pattern of ANALYZE_PATTERNS) {
    assert.match(ru, new RegExp(`Pattern: ${pattern}`));
  }
  assert.doesNotMatch(ru, /do not describe identity, facial features/i);
  assert.match(ru, /Appearance/);
});

test("inline heading bodies are normalized and validate", () => {
  const inline = [
    "Visual Hook: Маяк на островке перед водопадом.",
    "Scene: Озеро, утро.",
    "**Genre:** Пейзаж.",
    "Rendering: Живописная цифровая иллюстрация густыми мазками акрила.",
    "Environment: Скалы, остров, водопад.",
    "Lighting: Мягкий рассеянный.",
    "Camera: 50–70 мм.",
    "Color: Синий, оранжевый.",
    "Composition: Маяк по центру.",
    "Text:",
    "none",
    "Avoid:",
    "- не добавлять людей",
    "- Text: не менять надписи",
  ].join("\n");
  const body = normalizeAnalyzeLayout(inline);
  assert.match(body, /^Visual Hook:\nМаяк/m);
  assert.match(body, /^Genre:\nПейзаж/m);
  assert.match(body, /^Rendering:\nЖивописная/m);
  assert.match(body, /^- Text: не менять надписи$/m);
  assert.deepEqual(validateAnalyzeDraft({ pattern: "scene", medium: "illustration", body }), { ok: true });
});

test("every pattern includes Rendering and forbids photoreal language on non-photo mediums", () => {
  for (const pattern of ANALYZE_PATTERNS) {
    assert.ok(
      sectionOrderFor(pattern).includes("Rendering"),
      `${pattern} must include Rendering`,
    );
  }
  const prompt = buildRouterExtractPrompt("ru");
  assert.match(prompt, /Rendering:/);
  assert.match(prompt, /impasto oil\/acrylic digital painting/);
  assert.match(prompt, /never call painted or illustrated skin photorealistic/);
  const personIllusRules = patternCriticalRules("person", "illustration", "ru");
  assert.match(personIllusRules, /Rendering/);
});

test("parser strips Pattern and Medium and rejects unknown tokens", () => {
  const parsed = parseAnalyzeDraft(
    ["Pattern: layout", "Medium: graphic", "", "Visual Hook:", "A poster."].join("\n"),
  );
  assert.equal(parsed.pattern, "layout");
  assert.equal(parsed.medium, "graphic");
  assert.equal(parsed.body.startsWith("Visual Hook:"), true);
  assert.doesNotMatch(parsed.body, /^Pattern:/m);

  const invalid = parseAnalyzeDraft("Pattern: portrait\nMedium: photo\n\nScene:\nX");
  assert.equal(invalid.pattern, null);
  assert.equal(invalid.patternLineInvalid, true);
  assert.equal(invalid.medium, "photo");
});

test("layout without Text fails and a complete layout passes", () => {
  const order = sectionOrderFor("layout").filter((heading) => heading !== "Text");
  const missing = validateAnalyzeDraft({
    pattern: "layout",
    medium: "graphic",
    body: sectionBody(order),
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.reasons.includes("missing Text"));

  const ok = validateAnalyzeDraft({
    pattern: "layout",
    medium: "graphic",
    body: sectionBody(sectionOrderFor("layout"), { Text: "Регистрация" }),
  });
  assert.equal(ok.ok, true);
});

test("router flag is true only for the exact token", () => {
  assert.equal(isAnalyzePatternRouterFlagValue("true"), true);
  assert.equal(isAnalyzePatternRouterFlagValue(" TRUE "), true);
  assert.equal(isAnalyzePatternRouterFlagValue("false"), false);
  assert.equal(isAnalyzePatternRouterFlagValue(""), false);
  assert.equal(isAnalyzePatternRouterFlagValue(null), false);
  assert.equal(isAnalyzePatternRouterFlagValue("1"), false);
});

test("router and locked prompts unwrap screenshots, filter social UI text, and preserve multi-panel person collages", () => {
  const routerPrompt = buildRouterExtractPrompt("ru");
  const lockedPersonPrompt = buildLockedExtractPrompt("person", "photo", "ru");

  assert.match(routerPrompt, /VIEWPORT \/ SCREENSHOT UNWRAP/);
  assert.match(lockedPersonPrompt, /VIEWPORT \/ SCREENSHOT UNWRAP/);
  assert.match(
    routerPrompt,
    /Never choose layout merely because a photograph, photo collage, illustration, product, or scene was captured inside TikTok/,
  );
  assert.match(
    routerPrompt,
    /photographic collage \(even when captured inside a phone screenshot\) is photo/,
  );
  assert.match(routerPrompt, /garment prints like RED FLAG/);
  assert.match(
    routerPrompt,
    /NEVER include OS status-bar clocks, battery\/carrier labels, social-media usernames, post captions/,
  );
  assert.match(routerPrompt, /multi-panel photo collage or photo-booth strip of the same subject/);
  assert.match(routerPrompt, /panel count, stack or grid arrangement/);
  assert.match(routerPrompt, /forbid merging the panels into a single frame/);
  assert.match(routerPrompt, /forbid adding phone status bars, social-media icons/);
});

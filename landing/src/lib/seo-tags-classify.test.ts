import assert from "node:assert/strict";
import test from "node:test";
import { TAG_REGISTRY } from "@/lib/tag-registry";
import {
  inspectSeoTagOutput,
  parseClassifyJson,
  SeoTagsClassifyError,
} from "@/lib/seo-tags-classify";

test("accepts a small known tag set", () => {
  const result = parseClassifyJson(
    JSON.stringify({
      audience_tag: ["devushka"],
      style_tag: ["fashion", "editorial"],
      occasion_tag: [],
      object_tag: ["na_more"],
      doc_task_tag: [],
      new_tags: [],
    }),
  );

  assert.deepEqual(result.seoTags.audience_tag, ["devushka"]);
  assert.deepEqual(result.seoTags.style_tag, ["fashion", "editorial"]);
  assert.deepEqual(result.seoTags.object_tag, ["na_more"]);
  assert.equal(result.diagnostics.suspiciousReasons.length, 0);
});

test("keeps unknown tags as suggestions but not persisted seo tags", () => {
  const result = parseClassifyJson(
    JSON.stringify({
      audience_tag: ["devushka"],
      style_tag: [],
      occasion_tag: [],
      object_tag: ["na_more", "morskoy_stil"],
      doc_task_tag: [],
      new_tags: [
        {
          slug: "morskoy_stil",
          dimension: "object_tag",
          labelRu: "Морской стиль",
          labelEn: "Nautical style",
        },
      ],
    }),
  );

  assert.deepEqual(result.seoTags.object_tag, ["na_more"]);
  assert.deepEqual(
    result.newTags.map((tag) => tag.slug),
    ["morskoy_stil"],
  );
  assert.equal(result.diagnostics.droppedByDimension.object_tag, 1);
});

test("drops a known slug assigned to the wrong dimension", () => {
  const result = parseClassifyJson(
    JSON.stringify({
      audience_tag: [],
      style_tag: [],
      occasion_tag: [],
      object_tag: ["fashion"],
      doc_task_tag: [],
      new_tags: [],
    }),
  );

  assert.deepEqual(result.seoTags.object_tag, []);
  assert.deepEqual(result.newTags, []);
  assert.equal(result.diagnostics.droppedByDimension.object_tag, 1);
});

test("detects and rejects a registry dump", () => {
  const objectTags = TAG_REGISTRY.filter((tag) => tag.dimension === "object_tag").map(
    (tag) => tag.slug,
  );
  const payload = {
    audience_tag: ["devushka"],
    style_tag: ["fashion"],
    occasion_tag: [],
    object_tag: objectTags,
    doc_task_tag: [],
    new_tags: [],
  };

  const diagnostics = inspectSeoTagOutput(payload);
  assert.ok(diagnostics.suspiciousReasons.length > 0);
  assert.ok(
    diagnostics.suspiciousReasons.some((reason) =>
      reason.startsWith("object_tag:registry_coverage="),
    ),
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(
      () => parseClassifyJson(JSON.stringify(payload)),
      (error: unknown) =>
        error instanceof SeoTagsClassifyError &&
        error.code === "suspicious_tag_output",
    );
  }
});

/**
 * Image generation settings for extension analyze — kept separate from prompt text.
 * Aspect ratio is inferred from uploaded image dimensions, not written into prompt sections.
 */

export const EXTENSION_ASPECT_RATIO_OPTIONS = [
  { value: "1:1", label: "1:1" },
  { value: "3:4", label: "3:4" },
  { value: "4:5", label: "4:5" },
  { value: "4:7", label: "4:7" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
] as const;

export type ExtensionAspectRatio = (typeof EXTENSION_ASPECT_RATIO_OPTIONS)[number]["value"];

export type ExtensionImageSettings = {
  aspectRatio: ExtensionAspectRatio;
  width: number;
  height: number;
};

const RATIO_TARGETS: Array<{ value: ExtensionAspectRatio; ratio: number }> = [
  { value: "1:1", ratio: 1 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "4:5", ratio: 4 / 5 },
  { value: "4:7", ratio: 4 / 7 },
  { value: "9:16", ratio: 9 / 16 },
  { value: "16:9", ratio: 16 / 9 },
];

/** Map measured width/height to the closest supported aspect ratio label. */
export function inferAspectRatioFromDimensions(
  width: number,
  height: number,
): ExtensionAspectRatio | null {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

  const measured = w / h;
  let best: ExtensionAspectRatio = "1:1";
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const target of RATIO_TARGETS) {
    const delta = Math.abs(Math.log(measured / target.ratio));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = target.value;
    }
  }

  return best;
}

/**
 * Optional suffix for generation APIs that lack a native aspect-ratio parameter.
 * Not appended during analyze; callers add when building a final generation prompt.
 */
export function aspectRatioGenerationHint(aspectRatio: ExtensionAspectRatio): string {
  const vertical = ["3:4", "4:5", "4:7", "9:16"].includes(aspectRatio);
  const orientation = vertical ? "vertical" : aspectRatio === "16:9" ? "wide horizontal" : "square";
  return `${orientation} ${aspectRatio} framing`;
}

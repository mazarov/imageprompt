/**
 * Client-side mirror of extension image settings (aspect ratio kept separate from prompt text).
 * @see landing/src/lib/extension-image-settings.ts
 */

/** @typedef {{ aspectRatio: string; width: number; height: number }} ExtensionImageSettings */

export const EXTENSION_ASPECT_RATIO_OPTIONS = [
  { value: "1:1", label: "1:1" },
  { value: "3:4", label: "3:4" },
  { value: "4:5", label: "4:5" },
  { value: "4:7", label: "4:7" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
];

/** @param {unknown} value */
export function isExtensionImageSettings(value) {
  if (!value || typeof value !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof o.aspectRatio === "string" &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    o.width > 0 &&
    o.height > 0
  );
}

/**
 * Resize an image Blob to fit within maxPx on the longest side,
 * returning a JPEG data URL. Uses OffscreenCanvas (available in service workers).
 *
 * @param {Blob} blob     - Input image blob
 * @param {number} maxPx  - Maximum dimension on the longest side (default 1024)
 * @param {number} quality - JPEG quality 0–1 (default 0.85)
 * @returns {Promise<string>} JPEG data URL
 */

/**
 * @param {Uint8Array} u8
 * @returns {"image/jpeg" | "image/png" | "image/webp" | "image/gif" | null}
 */
export function sniffImageMimeFromUint8(u8) {
  if (!u8 || u8.length < 2) return null;
  const n = Math.min(u8.length, 12);
  const head = /** @type {Uint8Array} */ (
    u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
      ? u8.subarray(0, n)
      : new Uint8Array(ArrayBuffer.prototype.slice.call(u8.buffer, u8.byteOffset, u8.byteOffset + n))
  );

  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return "image/png";
  }
  if (head.length >= 6 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** @param {string} raw */
function normalizeMimeLabel(raw) {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!t || t === "application/octet-stream") return "";
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  return t;
}

const GENERATOR_MIMES = /** @type {const} */ (["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** @param {string} mime */
function isGeneratorImageMime(mime) {
  return GENERATOR_MIMES.includes(/** @type {(typeof GENERATOR_MIMES)[number]} */ (mime));
}

export async function resizeImageToDataUrl(blob, maxPx = 1024, quality = 0.85) {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const sniffed = sniffImageMimeFromUint8(uint8);
  const declared = normalizeMimeLabel(blob.type || "");
  const decodeMime = sniffed ?? (isGeneratorImageMime(declared) ? declared : null);

  if (typeof ImageDecoder !== "undefined" && decodeMime) {
    try {
      return await resizeViaImageDecoder(uint8, decodeMime, maxPx, quality);
    } catch {
      /* fall through */
    }
  }

  const outMime = sniffed ?? (isGeneratorImageMime(declared) ? declared : "image/jpeg");
  return blobToDataUrl(await new Blob([uint8], { type: outMime }));
}

async function resizeViaImageDecoder(uint8, mimeType, maxPx, quality) {
  const decoder = new ImageDecoder({
    data: uint8,
    type: mimeType,
  });

  const { image } = await decoder.decode();
  const { codedWidth: srcW, codedHeight: srcH } = image;

  const scale = Math.min(1, maxPx / Math.max(srcW, srcH));
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_2d");
  ctx.drawImage(image, 0, 0, dstW, dstH);
  image.close();

  const resizedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return blobToDataUrl(resizedBlob);
}

/**
 * Convert a Blob to a base64 data URL using FileReader-like logic.
 * Works in service workers via arrayBuffer + btoa.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const sniffed = sniffImageMimeFromUint8(bytes);
  const declared = normalizeMimeLabel(blob.type || "");
  const mime = sniffed ?? (isGeneratorImageMime(declared) ? declared : "image/jpeg");
  return `data:${mime};base64,${base64}`;
}

/**
 * Resize an image File/Blob in the popup context (has access to createImageBitmap).
 * Falls back to FileReader-only data URL if decode/resample fails (API accepts sniffed MIME).
 *
 * @param {Blob} blob
 * @param {number} maxPx
 * @param {number} quality
 * @returns {Promise<string>}
 */
export async function resizeImageInPopup(blob, maxPx = 1024, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(blob);
    const { width: srcW, height: srcH } = bitmap;

    const scale = Math.min(1, maxPx / Math.max(srcW, srcH));
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_2d");
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close();

    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return await blobToDataUrl(blob);
  }
}

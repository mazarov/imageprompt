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
  if (t === "image/jpg" || t === "image/pjpeg" || t === "image/jfif") return "image/jpeg";
  if (t === "image/x-webp") return "image/webp";
  return t;
}

const GENERATOR_MIMES = /** @type {const} */ (["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Common filename typos users (and some exporters) produce. */
const FILENAME_EXT_ALIASES = {
  jpg: "jpeg",
  jpeg: "jpeg",
  jpe: "jpeg",
  jfif: "jpeg",
  pjpeg: "jpeg",
  pjp: "jpeg",
  jepg: "jpeg",
  png: "png",
  gif: "gif",
  webp: "webp",
  wepb: "webp",
};

/** @param {string} mime */
function isGeneratorImageMime(mime) {
  return GENERATOR_MIMES.includes(/** @type {(typeof GENERATOR_MIMES)[number]} */ (mime));
}

/** @param {string} filename */
function filenameExtHint(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename || "").trim());
  if (!match) return null;
  const ext = match[1].toLowerCase();
  const canonical = FILENAME_EXT_ALIASES[/** @type {keyof typeof FILENAME_EXT_ALIASES} */ (ext)] ?? ext;
  if (canonical === "jpeg") return "image/jpeg";
  if (canonical === "png") return "image/png";
  if (canonical === "gif") return "image/gif";
  if (canonical === "webp") return "image/webp";
  return null;
}

/**
 * Accept uploads when magic bytes, MIME, or a known extension agree.
 * @param {Blob & { name?: string }} file
 * @returns {Promise<{ ok: true; mime: (typeof GENERATOR_MIMES)[number]; source: "signature" | "metadata" } | { ok: false }>}
 */
export async function validateImageUploadFile(file) {
  let head = null;
  try {
    const slice = file.slice(0, 16);
    const buffer = await Promise.race([
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
        reader.readAsArrayBuffer(slice);
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500))
    ]);
    head = new Uint8Array(buffer);
  } catch (err) {
    console.debug("[aid-upload] validate signature read failed or timed out", err);
  }

  if (head) {
    const sniffed = sniffImageMimeFromUint8(head);
    if (sniffed) return { ok: true, mime: sniffed, source: "signature" };
  }

  const declared = normalizeMimeLabel(file.type || "");
  if (isGeneratorImageMime(declared)) {
    return { ok: true, mime: /** @type {(typeof GENERATOR_MIMES)[number]} */ (declared), source: "metadata" };
  }

  const fromName = filenameExtHint(typeof file.name === "string" ? file.name : "");
  if (fromName) return { ok: true, mime: fromName, source: "metadata" };

  return { ok: false };
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
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_PREPARE_TIMEOUT_MS = 15_000;

/** @template T @param {Promise<T>} promise @param {number} ms */
function withTimeout(promise, ms, label = "timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`prepare_timeout: ${label}`)), ms);
    }),
  ]);
}

/** @param {Blob} blob @returns {Promise<string>} */
function blobToDataUrlViaReader(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (!/^data:image\//i.test(result)) {
        reject(new Error("invalid_data_url"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

/** @param {Blob} blob @param {number} timeoutMs @returns {Promise<string | null>} */
async function prepareDataUrlViaReader(blob, timeoutMs) {
  try {
    return await withTimeout(blobToDataUrlViaReader(blob), timeoutMs);
  } catch {
    return null;
  }
}

/**
 * Validate, size-check, and resize a user-selected file for analyze/upload flows.
 *
 * Chrome has a long-standing bug where files coming out of `<input type="file">`
 * sometimes become "ghost blobs": URL.createObjectURL still works and the file
 * shows up in <img>, but every direct JS read (blob.arrayBuffer, FileReader,
 * slice().arrayBuffer) hangs forever. To stay reliable we make the
 * <img> + canvas path PRIMARY and keep FileReader-based reads only as a
 * last-resort fallback. Browsers without DOM (service workers, Node tests)
 * fall back automatically to the FileReader/arrayBuffer path.
 *
 * @param {Blob & { name?: string; size?: number }} file
 * @param {{ maxBytes?: number; maxPx?: number; quality?: number; timeoutMs?: number }} [opts]
 * @returns {Promise<
 *   | { ok: true; dataUrl: string; mime: (typeof GENERATOR_MIMES)[number] }
 *   | { ok: false; error: "invalid_type" | "too_large" | "read_failed" }
 * >}
 */
export async function prepareUploadFile(file, opts = {}) {
  const maxBytes = opts.maxBytes ?? UPLOAD_MAX_BYTES;
  const maxPx = opts.maxPx ?? 1024;
  const quality = opts.quality ?? 0.85;
  const totalTimeout = opts.timeoutMs ?? UPLOAD_PREPARE_TIMEOUT_MS;

  if (!looksLikeImageByMetadata(file)) return { ok: false, error: "invalid_type" };

  const size = typeof file.size === "number" ? file.size : 0;
  if (size > maxBytes) return { ok: false, error: "too_large" };

  const mime = pickMimeFromMetadata(file);
  const hasDom = typeof document !== "undefined" && typeof Image !== "undefined";
  const hasObjectUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function";

  if (hasDom && hasObjectUrl) {
    try {
      const dataUrl = await withTimeout(
        dataUrlViaHtmlImage(file, maxPx, quality),
        Math.min(10_000, totalTimeout),
        "img_decode",
      );
      return { ok: true, dataUrl, mime };
    } catch (err1) {
      console.debug("[aid-upload] <img> path failed", err1);
    }

    try {
      const refreshed = await withTimeout(blobViaFetchObjectUrl(file), 6_000, "fetch_objecturl");
      const dataUrl = await withTimeout(
        dataUrlViaHtmlImage(refreshed, maxPx, quality),
        Math.min(10_000, totalTimeout),
        "img_decode_after_fetch",
      );
      return { ok: true, dataUrl, mime };
    } catch (err2) {
      console.debug("[aid-upload] fetch(objectURL) path failed", err2);
    }
  }

  try {
    const dataUrl = await withTimeout(
      blobToDataUrlViaReader(file),
      Math.min(8_000, totalTimeout),
      "filereader",
    );
    return { ok: true, dataUrl, mime };
  } catch (err3) {
    console.debug("[aid-upload] FileReader fallback failed", err3);
  }

  // Final SW-style escape hatch (used in OffscreenCanvas service workers / tests).
  try {
    const dataUrl = await withTimeout(blobToDataUrl(file), 8_000, "blobToDataUrl");
    return { ok: true, dataUrl, mime };
  } catch (err4) {
    console.debug("[aid-upload] arrayBuffer+btoa fallback failed", err4);
  }

  return { ok: false, error: "read_failed" };
}

/** @param {Blob & { name?: string }} file */
function looksLikeImageByMetadata(file) {
  const declared = normalizeMimeLabel(file.type || "");
  if (declared.startsWith("image/")) return true;
  if (isGeneratorImageMime(declared)) return true;
  if (filenameExtHint(typeof file.name === "string" ? file.name : "")) return true;
  return false;
}

/** @param {Blob & { name?: string }} file @returns {(typeof GENERATOR_MIMES)[number]} */
function pickMimeFromMetadata(file) {
  const declared = normalizeMimeLabel(file.type || "");
  if (isGeneratorImageMime(declared)) {
    return /** @type {(typeof GENERATOR_MIMES)[number]} */ (declared);
  }
  const fromName = filenameExtHint(typeof file.name === "string" ? file.name : "");
  if (fromName) return fromName;
  return "image/jpeg";
}

/** PRIMARY browser path: decode via <img src=objectURL> + canvas. */
async function dataUrlViaHtmlImage(file, maxPx, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img_decode_failed"));
      el.src = url;
    });
    return canvasJpegDataUrlFromSource(img, maxPx, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pull bytes through network stack — works when direct blob reads hang. */
async function blobViaFetchObjectUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const response = await fetch(url);
    return await response.blob();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {CanvasImageSource} source @param {number} maxPx @param {number} quality */
function canvasJpegDataUrlFromSource(source, maxPx, quality) {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!srcW || !srcH) throw new Error("empty_image");

  const scale = Math.min(1, maxPx / Math.max(srcW, srcH));
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_2d");
  ctx.drawImage(source, 0, 0, dstW, dstH);
  if ("close" in source && typeof source.close === "function") source.close();

  return canvas.toDataURL("image/jpeg", quality);
}

/** @param {Blob} blob @param {number} maxPx @param {number} quality */
async function resizeViaHtmlImage(blob, maxPx, quality) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img_decode_failed"));
      el.src = url;
    });
    return canvasJpegDataUrlFromSource(img, maxPx, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {Uint8Array} bytes @param {string} mime @param {number} maxPx @param {number} quality */
async function resizeViaImageDecoderPopup(bytes, mime, maxPx, quality) {
  if (typeof ImageDecoder === "undefined") throw new Error("no_image_decoder");
  const decoder = new ImageDecoder({ data: bytes, type: mime });
  const { image } = await decoder.decode();
  return canvasJpegDataUrlFromSource(image, maxPx, quality);
}

function safeArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsArrayBuffer(blob);
  });
}

export async function resizeImageInPopup(blob, maxPx = 1024, quality = 0.85) {
  const bytes = new Uint8Array(await withTimeout(safeArrayBuffer(blob), 10_000, "arrayBuffer"));
  const sniffed = sniffImageMimeFromUint8(bytes);
  const declared = normalizeMimeLabel(blob.type || "");
  const decodeMime =
    sniffed ?? (isGeneratorImageMime(declared) ? declared : filenameExtHint(blob.name) ?? null);
  const sourceBlob = new Blob([bytes], { type: decodeMime || blob.type || "application/octet-stream" });

  try {
    const bitmap = await withTimeout(createImageBitmap(sourceBlob), 8000, "createImageBitmap");
    return canvasJpegDataUrlFromSource(bitmap, maxPx, quality);
  } catch (err) {
    console.debug("[aid-upload] createImageBitmap failed", err);
    if (decodeMime) {
      try {
        return await resizeViaImageDecoderPopup(bytes, decodeMime, maxPx, quality);
      } catch (err2) {
        console.debug("[aid-upload] resizeViaImageDecoderPopup failed", err2);
      }
    }
    try {
      return await resizeViaHtmlImage(sourceBlob, maxPx, quality);
    } catch (err3) {
      console.debug("[aid-upload] resizeViaHtmlImage failed", err3);
      if (!sniffed) throw new Error("unsupported_image_bytes");
      return blobToDataUrl(sourceBlob);
    }
  }
}

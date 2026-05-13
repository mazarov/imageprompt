/**
 * Resize an image Blob to fit within maxPx on the longest side,
 * returning a JPEG data URL. Uses OffscreenCanvas (available in service workers).
 *
 * @param {Blob} blob     - Input image blob
 * @param {number} maxPx  - Maximum dimension in pixels (default 1024)
 * @param {number} quality - JPEG quality 0–1 (default 0.85)
 * @returns {Promise<string>} JPEG data URL
 */
export async function resizeImageToDataUrl(blob, maxPx = 1024, quality = 0.85) {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // Decode via ImageDecoder (available in service workers in Chrome 94+)
  if (typeof ImageDecoder !== "undefined") {
    return resizeViaImageDecoder(uint8, blob.type || "image/jpeg", maxPx, quality);
  }

  // Fallback: return original as data URL without resizing
  return blobToDataUrl(blob);
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
  const mime = blob.type || "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

/**
 * Resize an image File/Blob in the popup context (has access to createImageBitmap).
 * Falls back to blobToDataUrl without resizing if the input is already small.
 *
 * @param {Blob} blob
 * @param {number} maxPx
 * @param {number} quality
 * @returns {Promise<string>} JPEG data URL
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
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close();

    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // Fallback: return as-is via FileReader
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {string} */ (reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

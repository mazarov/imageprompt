import { resizeImageToDataUrl } from "./lib/image-utils.js";

const PENDING_IMAGE_KEY = "pending_image";
const CONTEXT_MENU_ID = "analyze-image";
const MAX_SW_FETCH_BYTES = 10 * 1024 * 1024;

// Register context menu once on install / service worker startup.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Get prompt for similar image",
    contexts: ["image"],
  });
});

// Re-register context menu on service-worker restart (MV3 SWs can be killed).
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

async function handleContextMenuClick(info, tab) {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const srcUrl = info.srcUrl;
  if (!srcUrl) return;

  try {
    const dataUrl = await fetchAndResizeImage(srcUrl, tab?.id);
    await chrome.storage.session.set({
      [PENDING_IMAGE_KEY]: { dataUrl, srcUrl, ts: Date.now() },
    });
  } catch (err) {
    console.error("[ai-image-describer] failed to process image", err?.message ?? err);
    // Store error signal so popup can show a friendly message
    await chrome.storage.session.set({
      [PENDING_IMAGE_KEY]: { error: "fetch_failed", srcUrl, ts: Date.now() },
    });
  }

  // Open popup (Chrome 127+). Silently ignore if unavailable.
  try {
    await chrome.action.openPopup();
  } catch {
    // Pre-127 Chrome or programmatic call outside user gesture — user can click the icon.
  }
}

/**
 * Try to fetch the image from the service worker.
 * If CORS blocks the direct fetch, fall back to injecting a script into the tab
 * that fetches the image in the page context and returns the blob via messaging.
 */
async function fetchAndResizeImage(srcUrl, tabId) {
  // Attempt 1: direct fetch from service worker
  try {
    const res = await fetch(srcUrl, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SW_FETCH_BYTES) throw new Error("image_too_large");
    const blob = await res.blob();
    if (blob.size > MAX_SW_FETCH_BYTES) throw new Error("image_too_large");
    return resizeImageToDataUrl(blob);
  } catch (directErr) {
    // Attempt 2: CORS fallback via content script injection into the active tab
    if (!tabId) throw directErr;
    return fetchViaContentScript(srcUrl, tabId);
  }
}

/**
 * Inject a one-shot script into the page that fetches the image in the page's
 * origin context (bypasses CORS) and returns a base64 data URL.
 * Uses synchronous btoa() to avoid nested-Promise serialization issues.
 */
function fetchViaContentScript(srcUrl, tabId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("content_script_timeout")), 20_000);

    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: async (url) => {
          try {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) return { error: `HTTP ${res.status}` };
            const arrayBuffer = await res.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            // Convert to base64 in chunks to avoid stack overflow on large arrays
            const CHUNK = 8192;
            let binary = "";
            for (let i = 0; i < bytes.length; i += CHUNK) {
              binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
            }
            const base64 = btoa(binary);
            // Detect MIME from first bytes (magic numbers)
            const sig = bytes.slice(0, 4);
            let mime = "image/jpeg";
            if (sig[0] === 0x89 && sig[1] === 0x50) mime = "image/png";
            else if (sig[0] === 0x47 && sig[1] === 0x49) mime = "image/gif";
            else if (sig[0] === 0x52 && sig[1] === 0x49) mime = "image/webp";
            return { dataUrl: `data:${mime};base64,${base64}` };
          } catch (e) {
            return { error: e?.message ?? "fetch_failed" };
          }
        },
        args: [srcUrl],
      },
      (results) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        const result = results?.[0]?.result;
        if (!result || result.error) {
          return reject(new Error(result?.error ?? "no_result"));
        }
        resolve(result.dataUrl);
      }
    );
  });
}

import { resizeImageToDataUrl } from "./lib/image-utils.js";

const PENDING_IMAGE_KEY = "pending_image";
const CONTEXT_MENU_ID = "analyze-image";
const CONTEXT_OPEN_SITE = "open-imageprompt-with-image";
const WEB_PENDING_STORAGE_KEY = "extension_lite_web_pending";
const HISTORY_QUEUE_KEY = "extension_lite_history_queue_v1";
const MAX_HISTORY_QUEUE_ENTRIES = 45;
const MAX_SW_FETCH_BYTES = 10 * 1024 * 1024;

const SITE_URL = "https://imageprompt.tools/";
const LITE_ANALYZE_API_URL = `${new URL("/", SITE_URL).origin}/api/extension/analyze`;

/** Hosts where lite content-script runs — keep in sync with manifest.json matches. */
function isLiteHost(hostname) {
  return (
    hostname === "imageprompt.tools" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

// Register context menus once on install / service worker startup.
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Get prompt for similar image",
    contexts: ["image"],
  });
  chrome.contextMenus.create({
    id: CONTEXT_OPEN_SITE,
    title: "Open imageprompt.tools with this image",
    contexts: ["image"],
  });

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    const welcomeUrl = new URL("/welcome", SITE_URL).href;
    chrome.tabs.create({ url: welcomeUrl }).catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "OPEN_SITE_WITH_IMAGE" && typeof msg.dataUrl === "string") {
    openSiteWithPendingImage(msg.dataUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "LITE_HISTORY_APPEND" && msg.entry != null) {
    void relayOrQueueLiteHistoryEntry(msg.entry)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "CONSUME_LITE_HISTORY_QUEUE") {
    chrome.storage.local.get(HISTORY_QUEUE_KEY, (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message, entries: [] });
        return;
      }
      const entries = Array.isArray(data?.[HISTORY_QUEUE_KEY]?.entries)
        ? data[HISTORY_QUEUE_KEY].entries
        : [];
      chrome.storage.local.remove(HISTORY_QUEUE_KEY, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message, entries: [] });
          return;
        }
        sendResponse({ ok: true, entries });
      });
    });
    return true;
  }
  // Content scripts cannot reliably read chrome.storage.session — pop pending in the SW.
  if (msg?.type === "CONSUME_WEB_PENDING") {
    chrome.storage.session.get(WEB_PENDING_STORAGE_KEY, (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      const payload = data?.[WEB_PENDING_STORAGE_KEY];
      if (!payload) {
        sendResponse({ ok: true, payload: null });
        return;
      }
      chrome.storage.session.remove(WEB_PENDING_STORAGE_KEY, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, payload });
      });
    });
    return true;
  }
  if (msg?.type === "LITE_RESIZE_IMG_URL" && typeof msg.srcUrl === "string") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no_tab" });
      return false;
    }
    fetchAndResizeImage(msg.srcUrl, tabId)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "LITE_OVERLAY_OPEN_TOOLBAR_POPUP" && typeof msg.srcUrl === "string") {
    const tabId = sender.tab?.id;
    openToolbarPopupForImage(msg.srcUrl, tabId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "LITE_OVERLAY_ANALYZE" && typeof msg.dataUrl === "string" && typeof msg.style === "string") {
    liteOverlayAnalyze(msg.dataUrl, msg.style).then(sendResponse).catch((e) =>
      sendResponse({ ok: false, error: String(e?.message ?? e) }),
    );
    return true;
  }
  return false;
});

/**
 * Unified popup flow for overlay and action button:
 * resize image -> store pending payload for popup.js -> open toolbar popup.
 */
async function openToolbarPopupForImage(srcUrl, tabId) {
  try {
    const dataUrl = await fetchAndResizeImage(srcUrl, tabId);
    await chrome.storage.session.set({
      [PENDING_IMAGE_KEY]: { dataUrl, srcUrl, ts: Date.now(), source: "overlay" },
    });
  } catch (err) {
    await chrome.storage.session.set({
      [PENDING_IMAGE_KEY]: { error: "fetch_failed", srcUrl, ts: Date.now(), source: "overlay" },
    });
  }

  try {
    await chrome.action.openPopup();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err ?? "open_popup_failed") };
  }
}

/**
 * Analyze image from lite overlay/modal via service worker fetch (aligned with popup).
 * @returns {Promise<{ ok: true; prompt: string } | { ok: false; status?: number; error?: string }>}
 */
async function liteOverlayAnalyze(dataUrl, style) {
  let res;
  try {
    res = await fetch(LITE_ANALYZE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: dataUrl, style }),
    });
  } catch (err) {
    return { ok: false, error: "fetch_failed", message: String(err?.message ?? err) };
  }

  /** @type {unknown} */
  let data = null;
  try {
    data = await res.json();
  } catch {
    if (res.status === 404) {
      return { ok: false, status: res.status, error: "not_found" };
    }
    return { ok: false, status: res.status, error: "bad_response" };
  }

  if (!res.ok) {
    /** @type {{ error?: string }} */
    const d = data && typeof data === "object" ? data : {};
    return {
      ok: false,
      status: res.status,
      error: d.error ?? "request_failed",
    };
  }

  if (!data || typeof data !== "object" || typeof data.prompt !== "string" || !data.prompt) {
    return { ok: false, error: "empty_prompt" };
  }

  return { ok: true, prompt: data.prompt };
}

/**
 * Persist recognition on the site origin: try all matching tabs via content-script;
 * if none ACK, queue until a tab loads content-bridge.
 */
async function relayOrQueueLiteHistoryEntry(entry) {
  try {
    const tabs = await chrome.tabs.query({});
    let delivered = false;
    await Promise.all(
      tabs.map(async (tab) => {
        try {
          const raw = tab.url || "";
          let hostname = "";
          try {
            hostname = new URL(raw).hostname;
          } catch {
            return;
          }
          if (!isLiteHost(hostname) || tab.id == null) return;
          const ack = await chrome.tabs.sendMessage(tab.id, {
            type: "LITE_HISTORY_APPEND",
            entry,
          });
          if (ack?.ok) delivered = true;
        } catch {
          /** tab has no injected listener yet */
        }
      }),
    );
    if (!delivered) await enqueueLiteHistory(entry);
  } catch (err) {
    console.warn("[ai-image-describer] history relay failed", err?.message ?? err);
    await enqueueLiteHistory(entry);
  }
}

function dedupeQueuedEntries(entries) {
  const seen = new Set();
  const out = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const id = e?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.unshift(e);
  }
  if (out.length > MAX_HISTORY_QUEUE_ENTRIES) {
    return out.slice(out.length - MAX_HISTORY_QUEUE_ENTRIES);
  }
  return out;
}

async function enqueueLiteHistory(entry) {
  const prev = await chrome.storage.local.get(HISTORY_QUEUE_KEY);
  const merged = dedupeQueuedEntries([...(prev?.[HISTORY_QUEUE_KEY]?.entries ?? []), entry]);
  await chrome.storage.local.set({
    [HISTORY_QUEUE_KEY]: { entries: merged, ts: Date.now() },
  });
}

async function openSiteWithPendingImage(dataUrl) {
  await chrome.storage.session.set({
    [WEB_PENDING_STORAGE_KEY]: { dataUrl, ts: Date.now() },
  });
  await chrome.tabs.create({ url: SITE_URL });
}

async function handleContextMenuClick(info, tab) {
  if (info.menuItemId !== CONTEXT_MENU_ID && info.menuItemId !== CONTEXT_OPEN_SITE) return;

  const srcUrl = info.srcUrl;
  if (!srcUrl) return;

  if (info.menuItemId === CONTEXT_OPEN_SITE) {
    try {
      const dataUrl = await fetchAndResizeImage(srcUrl, tab?.id);
      await openSiteWithPendingImage(dataUrl);
    } catch (err) {
      console.error("[ai-image-describer] open site: failed to process image", err?.message ?? err);
      await chrome.storage.session.set({
        [WEB_PENDING_STORAGE_KEY]: { error: "fetch_failed", ts: Date.now() },
      });
      await chrome.tabs.create({ url: SITE_URL });
    }
    return;
  }

  try {
    const dataUrl = await fetchAndResizeImage(srcUrl, tab?.id);
    await chrome.storage.session.set({
      [PENDING_IMAGE_KEY]: { dataUrl, srcUrl, ts: Date.now() },
    });
  } catch (err) {
    console.error("[ai-image-describer] failed to process image", err?.message ?? err);
    await chrome.storage.session.set({
      [PENDING_IMAGE_KEY]: { error: "fetch_failed", srcUrl, ts: Date.now() },
    });
  }

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
  try {
    const res = await fetch(srcUrl, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SW_FETCH_BYTES) throw new Error("image_too_large");
    const blob = await res.blob();
    if (blob.size > MAX_SW_FETCH_BYTES) throw new Error("image_too_large");
    return resizeImageToDataUrl(blob);
  } catch (directErr) {
    if (!tabId) throw directErr;
    return fetchViaContentScript(srcUrl, tabId);
  }
}

/**
 * Inject a one-shot script into the page that fetches the image in the page's
 * origin context (bypasses CORS) and returns a base64 data URL.
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
            const CHUNK = 8192;
            let binary = "";
            for (let i = 0; i < bytes.length; i += CHUNK) {
              binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
            }
            const base64 = btoa(binary);
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
      },
    );
  });
}

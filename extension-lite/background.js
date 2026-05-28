import { resizeImageToDataUrl } from "./lib/image-utils.js";

const PENDING_IMAGE_KEY = "pending_image";
const CONTEXT_MENU_ID = "analyze-image";
const CONTEXT_OPEN_SITE = "open-imageprompt-with-image";
const WEB_PENDING_STORAGE_KEY = "extension_lite_web_pending";
const HISTORY_QUEUE_KEY = "extension_lite_history_queue_v1";
const ANALYSIS_JOB_KEY = "extension_lite_analysis_job_v1";
const MAX_HISTORY_QUEUE_ENTRIES = 45;
const MAX_SW_FETCH_BYTES = 10 * 1024 * 1024;
const ANALYSIS_FETCH_TIMEOUT_MS = 45_000;

const SITE_URL = "https://imageprompt.tools/";
const LITE_ORIGIN = new URL("/", SITE_URL).origin;
const LITE_ANALYZE_API_URL = `${LITE_ORIGIN}/api/extension/analyze`;
const LITE_DEV_IP_HASH_URL = `${LITE_ORIGIN}/api/extension/dev-ip-hash`;
const LITE_AUTH_EXCHANGE_URL = `${LITE_ORIGIN}/api/auth/extension/exchange`;
const APP_JWT_STORAGE_KEY = "ip_app_jwt";

/** Hosts where lite content-script runs — keep in sync with manifest.json matches. */
function isLiteHost(hostname) {
  return (
    hostname === "imageprompt.tools" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

function isValidStyle(style) {
  return ["photoreal", "midjourney", "sd", "flux"].includes(style);
}

function createJobId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
    const welcomeUrl = new URL("/ai-image-describer/welcome", SITE_URL).href;
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
  if (msg?.type === "GET_LITE_ANALYSIS_JOB") {
    chrome.storage.local.get(ANALYSIS_JOB_KEY, (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message, job: null });
        return;
      }
      sendResponse({ ok: true, job: data?.[ANALYSIS_JOB_KEY] ?? null });
    });
    return true;
  }
  if (msg?.type === "CLEAR_LITE_ANALYSIS_JOB") {
    chrome.storage.local.remove(ANALYSIS_JOB_KEY, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "LITE_AUTH_STATUS") {
    getLiteAuthStatus()
      .then((status) => sendResponse({ ok: true, ...status }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "LITE_AUTH_START") {
    startLiteAuthFlow()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "LITE_AUTH_SIGN_OUT") {
    clearLiteAuthToken()
      .then(() => sendResponse({ ok: true, signedIn: false }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "LITE_AUTH_EXCHANGE_CODE" && typeof msg.code === "string") {
    exchangeLiteAuthCode(msg.code)
      .then((status) => sendResponse({ ok: true, ...status }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "START_LITE_ANALYSIS" && typeof msg.dataUrl === "string") {
    console.debug("[aid-upload] START_LITE_ANALYSIS", {
      style: msg.style,
      dataUrlLen: msg.dataUrl.length,
    });
    startLiteAnalysisJob(msg.dataUrl, msg.style)
      .then((job) => sendResponse({ ok: true, job }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "FETCH_LITE_DEV_IP_HASH") {
    fetch(LITE_DEV_IP_HASH_URL, { method: "GET", cache: "no-store" })
      .then(async (res) => {
        let body = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (!res.ok) {
          sendResponse({
            ok: false,
            status: res.status,
            error:
              typeof body?.message === "string"
                ? body.message
                : typeof body?.error === "string"
                  ? body.error
                  : "request_failed",
          });
          return;
        }
        if (!body || typeof body !== "object" || typeof body.ip_hash !== "string") {
          sendResponse({ ok: false, error: "bad_response" });
          return;
        }
        sendResponse({
          ok: true,
          ip_hash: body.ip_hash,
          window_start: typeof body.window_start === "string" ? body.window_start : "",
          utc_day_yyyymmdd: typeof body.utc_day_yyyymmdd === "string" ? body.utc_day_yyyymmdd : "",
        });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e ?? "fetch_failed") }));
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
  const ts = Date.now();
  const popupPromise = chrome.action.openPopup();

  void chrome.storage.session.set({
    [PENDING_IMAGE_KEY]: { status: "loading", srcUrl, ts, source: "overlay" },
  });

  try {
    await popupPromise;
    void preparePopupImage(srcUrl, tabId, ts);
    return { ok: true };
  } catch (err) {
    void chrome.storage.session.remove(PENDING_IMAGE_KEY);
    return { ok: false, error: String(err?.message ?? err ?? "open_popup_failed") };
  }
}

async function preparePopupImage(srcUrl, tabId, ts) {
  let pending;
  try {
    const dataUrl = await fetchAndResizeImage(srcUrl, tabId);
    pending = { dataUrl, srcUrl, ts, source: "overlay" };
  } catch {
    pending = { error: "fetch_failed", srcUrl, ts, source: "overlay" };
  }

  await chrome.storage.session.set({ [PENDING_IMAGE_KEY]: pending });
  chrome.runtime.sendMessage({ type: "LITE_PENDING_IMAGE_READY", pending }).catch(() => {});
}

async function setAnalysisJob(job) {
  await chrome.storage.local.set({ [ANALYSIS_JOB_KEY]: job });
  chrome.runtime.sendMessage({ type: "LITE_ANALYSIS_JOB_UPDATED", job }).catch(() => {});
}

async function getAnalysisJob() {
  const data = await chrome.storage.local.get(ANALYSIS_JOB_KEY);
  return data?.[ANALYSIS_JOB_KEY] ?? null;
}

async function getLiteAuthToken() {
  const data = await chrome.storage.local.get(APP_JWT_STORAGE_KEY);
  const token = data?.[APP_JWT_STORAGE_KEY];
  return typeof token === "string" && token ? token : "";
}

async function clearLiteAuthToken() {
  await chrome.storage.local.remove(APP_JWT_STORAGE_KEY);
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function getLiteAuthStatus() {
  const token = await getLiteAuthToken();
  if (!token) return { signedIn: false };
  const payload = decodeJwtPayload(token);
  return {
    signedIn: true,
    email: typeof payload?.email === "string" ? payload.email : "",
    name: typeof payload?.name === "string" ? payload.name : "",
  };
}

async function startLiteAuthFlow() {
  const nextPath = "/auth/extension/finish";
  const url = `${LITE_ORIGIN}/api/auth/google?flow=extension&next=${encodeURIComponent(nextPath)}`;
  await chrome.tabs.create({ url });
}

async function exchangeLiteAuthCode(code) {
  const res = await fetch(LITE_AUTH_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.accessToken !== "string" || !data.accessToken) {
    throw new Error(data.error || "exchange_failed");
  }
  await chrome.storage.local.set({ [APP_JWT_STORAGE_KEY]: data.accessToken });
  const status = await getLiteAuthStatus();
  chrome.runtime.sendMessage({ type: "LITE_AUTH_UPDATED", ...status }).catch(() => {});
  return status;
}

async function startLiteAnalysisJob(dataUrl, styleValue) {
  const style = isValidStyle(styleValue) ? styleValue : "photoreal";
  const job = {
    id: createJobId(),
    status: "analyzing",
    dataUrl,
    style,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await setAnalysisJob(job);
  void completeLiteAnalysisJob(job).catch((e) =>
    console.warn("[ai-image-describer] analysis job failed", e?.message ?? e),
  );
  return job;
}

async function completeLiteAnalysisJob(startedJob) {
  let result;
  try {
    result = await liteOverlayAnalyze(startedJob.dataUrl, startedJob.style);
  } catch (err) {
    result = { ok: false, error: "request_failed", message: String(err?.message ?? err) };
  }
  const current = await getAnalysisJob();
  if (!current || current.id !== startedJob.id) return;

  if (result.ok && typeof result.prompt === "string") {
    const entry = createLiteHistoryEntry(startedJob.dataUrl, startedJob.style, result.prompt);
    await setAnalysisJob({
      ...startedJob,
      status: "result",
      prompt: result.prompt,
      historyEntryId: entry.id,
      updatedAt: Date.now(),
    });
    await relayOrQueueLiteHistoryEntry(entry);
    return;
  }

  await setAnalysisJob({
    ...startedJob,
    status: "error",
    error: result.error || "request_failed",
    statusCode: result.status,
    updatedAt: Date.now(),
  });
}

function createLiteHistoryEntry(dataUrl, style, prompt) {
  return {
    id: createJobId(),
    createdAt: new Date().toISOString(),
    style,
    prompt,
    image: { mode: "data_url", dataUrl },
  };
}

/**
 * Analyze image from lite overlay/modal via service worker fetch (aligned with popup).
 * @returns {Promise<{ ok: true; prompt: string } | { ok: false; status?: number; error?: string }>}
 */
async function liteOverlayAnalyze(dataUrl, style) {
  let res;
  try {
    const token = await getLiteAuthToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(LITE_ANALYZE_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ image_base64: dataUrl, style }),
      signal: AbortSignal.timeout(ANALYSIS_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const errName = String(err?.name ?? "");
    if (errName === "AbortError" || errName === "TimeoutError") {
      return { ok: false, error: "timeout", message: "analysis_timeout" };
    }
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

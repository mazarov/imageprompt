/**
 * Runs on imageprompt.tools (and localhost) at document_start.
 * 1) Pending image: session storage handoff for PromptSceneLiteWidget.
 * 2) Recognition history: merges extension -> page localStorage (canonical store).
 */
const SESSION_KEY = "extension_lite_pending";

const HISTORY_STORAGE_KEY = "extension_lite_recognition_history_v1";
const MAX_HISTORY_ENTRIES = 35;
const STYLES_OK = new Set(["photoreal", "midjourney", "sd", "flux"]);

chrome.runtime.sendMessage({ type: "CONSUME_WEB_PENDING" }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn("[extension-lite] consume web pending:", chrome.runtime.lastError.message);
    return;
  }
  if (!response?.ok || !response.payload) return;

  const payload = response.payload;
  try {
    const toStore =
      payload.dataUrl != null
        ? { dataUrl: payload.dataUrl, ts: payload.ts ?? Date.now() }
        : { error: payload.error ?? "fetch_failed", ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(toStore));
    window.dispatchEvent(new CustomEvent("extension-lite-pending"));
  } catch (e) {
    console.warn("[extension-lite] bridge to page sessionStorage failed", e);
  }
});

function bumpHistoryEvent() {
  try {
    window.dispatchEvent(new CustomEvent("extension-lite-recognition-history"));
  } catch {
    /* noop */
  }
}

function isValidHistoryEntry(e) {
  if (!e || typeof e !== "object") return false;
  if (typeof e.id !== "string" || !e.id) return false;
  if (typeof e.createdAt !== "string") return false;
  if (typeof e.prompt !== "string") return false;
  if (!STYLES_OK.has(e.style)) return false;
  const img = e.image;
  if (!img || typeof img !== "object") return false;
  if (img.mode === "data_url" && typeof img.dataUrl === "string" && img.dataUrl.length > 0) return true;
  if (img.mode === "image_url" && typeof img.imageUrl === "string" && img.imageUrl.length > 0) return true;
  return false;
}

function readHistoryList() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidHistoryEntry) : [];
  } catch {
    return [];
  }
}

function writeHistoryList(list) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[extension-lite] history write failed", err);
  }
}

function mergeLists(incomingNewestFirst, existingNewestFirst) {
  const seen = new Set();
  const out = [];
  for (const e of [...incomingNewestFirst, ...existingNewestFirst]) {
    if (!isValidHistoryEntry(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return out.slice(0, MAX_HISTORY_ENTRIES);
}

function persistMerged(incomingOrderedNewest) {
  const valid = incomingOrderedNewest.filter(isValidHistoryEntry);
  if (!valid.length) return;
  const merged = mergeLists(valid, readHistoryList());
  writeHistoryList(merged);
  bumpHistoryEvent();
}

function flushQueuedHistory() {
  chrome.runtime.sendMessage({ type: "CONSUME_LITE_HISTORY_QUEUE" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[extension-lite] consume history queue:", chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok || !response.entries?.length) return;
    persistMerged(response.entries);
  });
}

flushQueuedHistory();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LITE_HISTORY_APPEND" && msg.entry != null) {
    try {
      if (!isValidHistoryEntry(msg.entry)) {
        sendResponse({ ok: false, error: "invalid_entry" });
        return true;
      }
      persistMerged([msg.entry]);
      sendResponse({ ok: true });
    } catch {
      sendResponse({ ok: false });
    }
    return true;
  }
  return false;
});

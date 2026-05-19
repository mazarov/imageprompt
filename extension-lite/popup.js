import { resizeImageInPopup } from "./lib/image-utils.js";

// Allow dev override: localStorage.setItem("aid_api_origin", "http://localhost:3001")
const API_ORIGIN =
  (typeof localStorage !== "undefined" && localStorage.getItem("aid_api_origin")) ||
  "https://imageprompt.tools";
const API_URL = `${API_ORIGIN}/api/extension/analyze`;
const PENDING_IMAGE_KEY = "pending_image";
const SITE_HISTORY_URL = "https://imageprompt.tools/#extension-lite-history";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ── DOM refs ──
const panels = {
  empty:   document.getElementById("state-empty"),
  loading: document.getElementById("state-loading"),
  result:  document.getElementById("state-result"),
  error:   document.getElementById("state-error"),
};

const loadingPreview  = document.getElementById("loading-preview");
const resultPreview   = document.getElementById("result-preview");
const promptBox       = document.getElementById("prompt-box");
const errorBanner     = document.getElementById("error-banner");
const errorMessage    = document.getElementById("error-message");
const btnCopy         = document.getElementById("btn-copy");
const btnRetry        = document.getElementById("btn-retry");
const btnOpenHistorySite = document.getElementById("btn-open-history-site");
const btnErrorRetry   = document.getElementById("btn-error-retry");
const btnChooseFile   = document.getElementById("btn-choose-file");
const btnOpenSite     = document.getElementById("btn-open-site");
const fileInput       = document.getElementById("file-input");
const dropzone        = document.getElementById("dropzone");
const styleSelect     = document.getElementById("style-select");

// ── State ──
let currentPrompt = "";
/** @type {"analyze" | "open_site"} */
let filePickIntent = "analyze";

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  await checkPendingImage();
  bindEvents();
});

async function checkPendingImage() {
  let pending;
  try {
    const result = await chrome.storage.session.get(PENDING_IMAGE_KEY);
    pending = result[PENDING_IMAGE_KEY];
  } catch {
    return; // storage not available, show empty state
  }

  if (!pending) return;

  // Clear so next popup open starts fresh
  chrome.storage.session.remove(PENDING_IMAGE_KEY).catch(() => {});

  if (pending.error === "fetch_failed") {
    // Background couldn't fetch the image from the page (CORS or blocked URL).
    // Fall through to empty state and show a soft notice so user can upload manually.
    showNotice("Couldn't grab the image automatically. Upload a file instead.");
    return;
  }

  if (pending.dataUrl) {
    showLoading(pending.dataUrl);
    await analyze(pending.dataUrl);
  }
}

function bindEvents() {
  // Choose file button
  btnChooseFile.addEventListener("click", () => {
    filePickIntent = "analyze";
    fileInput.click();
  });

  btnOpenSite.addEventListener("click", () => {
    filePickIntent = "open_site";
    fileInput.click();
  });

  if (btnOpenHistorySite) {
    btnOpenHistorySite.addEventListener("click", () => {
      try {
        chrome.tabs.create({ url: SITE_HISTORY_URL });
      } catch (e) {
        console.warn("[aid] open history tab", e);
      }
    });
  }

  // File input change
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // reset so same file can be re-selected
    if (!file) return;
    const intent = filePickIntent;
    filePickIntent = "analyze";
    if (intent === "open_site") {
      await handleFileForSite(file);
      return;
    }
    await handleFile(file);
  });

  // Drag-and-drop on dropzone
  dropzone.addEventListener("dragenter", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragover",  (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove("drag-over");
  });
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  });

  // Keyboard activation on dropzone
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });

  // Paste from clipboard
  document.addEventListener("paste", async (e) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (item) {
      const file = item.getAsFile();
      if (file) await handleFile(file);
    }
  });

  // Copy prompt
  btnCopy.addEventListener("click", async () => {
    if (!currentPrompt) return;
    try {
      await navigator.clipboard.writeText(currentPrompt);
      const original = btnCopy.textContent;
      btnCopy.textContent = "Copied to clipboard";
      btnCopy.disabled = true;
      setTimeout(() => {
        btnCopy.textContent = original;
        btnCopy.disabled = false;
      }, 2000);
    } catch {
      // Fallback: select text in pre
      const range = document.createRange();
      range.selectNodeContents(promptBox);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // Try another image
  btnRetry.addEventListener("click", () => showPanel("empty"));
  btnErrorRetry.addEventListener("click", () => showPanel("empty"));
}

async function handleFileForSite(file) {
  if (!file.type.startsWith("image/")) {
    showInlineError("Please drop an image file (JPG or PNG).");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showInlineError("Image exceeds 10 MB limit. Please try a smaller file.");
    return;
  }

  let dataUrl;
  try {
    dataUrl = await resizeImageInPopup(file, 1024, 0.85);
  } catch {
    showInlineError("Something went wrong reading the file. Please try another image.");
    return;
  }

  try {
    const res = await chrome.runtime.sendMessage({ type: "OPEN_SITE_WITH_IMAGE", dataUrl });
    if (!res?.ok) {
      showFullError(res?.error || "Could not open the site tab.");
    }
  } catch (e) {
    console.error("[aid] sendMessage failed", e);
    showFullError("Could not open imageprompt.tools.");
  }
}

async function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showInlineError("Please drop an image file (JPG or PNG).");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showInlineError("Image exceeds 10 MB limit. Please try a smaller file.");
    return;
  }

  let dataUrl;
  try {
    dataUrl = await resizeImageInPopup(file, 1024, 0.85);
  } catch {
    showInlineError("Something went wrong reading the file. Please try another image.");
    return;
  }

  showLoading(dataUrl);
  await analyze(dataUrl);
}

async function analyze(dataUrl) {
  const style = styleSelect?.value || "photoreal";

  let res, data;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: dataUrl, style }),
    });
  } catch (err) {
    console.error("[aid] fetch failed", err?.message);
    showFullError("Connection failed. Check your internet connection and try again.");
    return;
  }

  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. 404 HTML from undeployed endpoint)
    console.error("[aid] non-JSON response", res.status, res.url);
    if (res.status === 404) {
      showFullError("Service not available yet. Try again after the next deployment.");
    } else {
      showFullError("Something went wrong. Please try another image.");
    }
    return;
  }

  if (!res.ok) {
    console.error("[aid] API error", res.status, data);
    if (data?.error === "rate_limited") {
      showFullError("Daily limit reached. Try again in 24 hours.");
    } else {
      showFullError("Something went wrong. Please try another image.");
    }
    return;
  }

  if (!data?.prompt) {
    console.error("[aid] empty prompt in response", data);
    showFullError("Something went wrong. Please try another image.");
    return;
  }

  showResult(dataUrl, data.prompt, style);
}

/** @typedef {{ id: string; createdAt: string; style: string; prompt: string; image: { mode: "data_url"; dataUrl: string } }}} LiteHistoryEntry */

function createLiteHistoryEntry(dataUrl, style, prompt) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return {
    id,
    createdAt: new Date().toISOString(),
    style,
    prompt,
    image: { mode: "data_url", dataUrl },
  };
}

function sendLiteHistoryToSite(entry) {
  chrome.runtime
    .sendMessage({ type: "LITE_HISTORY_APPEND", entry })
    .catch((e) => console.warn("[aid] LITE_HISTORY_APPEND failed", e));
}

// ── Panel helpers ──
function showPanel(name) {
  Object.entries(panels).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
}

function showLoading(dataUrl) {
  loadingPreview.src = dataUrl;
  showPanel("loading");
}

function showResult(dataUrl, prompt, styleUsed) {
  currentPrompt = prompt;
  resultPreview.src = dataUrl;
  promptBox.textContent = prompt;
  errorBanner.hidden = true;
  showPanel("result");

  sendLiteHistoryToSite(createLiteHistoryEntry(dataUrl, styleUsed || "photoreal", prompt));
}

function showFullError(message) {
  errorMessage.textContent = message;
  showPanel("error");
}

function showInlineError(message) {
  // If we're in the result state, show inline; otherwise go to error
  if (panels.result.classList.contains("active")) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  } else {
    showFullError(message);
  }
}

/** Show a soft notice on the empty state (e.g. "couldn't grab image automatically"). */
function showNotice(message) {
  const notice = document.getElementById("empty-notice");
  if (notice) {
    notice.textContent = message;
    notice.hidden = false;
  }
  showPanel("empty");
}

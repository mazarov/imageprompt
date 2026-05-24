import { resizeImageInPopup } from "./lib/image-utils.js";

const PENDING_IMAGE_KEY = "pending_image";
const POPUP_STATE_KEY = "extension_lite_popup_state_v1";
const ANALYSIS_JOB_KEY = "extension_lite_analysis_job_v1";
const SITE_HISTORY_URL = "https://imageprompt.tools/#extension-lite-history";
const DEV_BRAND_TAP_WINDOW_MS = 2000;
const DEV_BRAND_TAPS_TO_UNLOCK = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ── DOM refs ──
const panels = {
  empty:   document.getElementById("state-empty"),
  draft:   document.getElementById("state-draft"),
  loading: document.getElementById("state-loading"),
  result:  document.getElementById("state-result"),
  error:   document.getElementById("state-error"),
};

const draftPreview    = document.getElementById("draft-preview");
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
const btnClosePopup   = document.getElementById("btn-close-popup");
const btnAnalyzeDraft = document.getElementById("btn-analyze-draft");
const btnDraftAnother = document.getElementById("btn-draft-another");
const fileInput       = document.getElementById("file-input");
const dropzone        = document.getElementById("dropzone");
const styleSelect     = document.getElementById("style-select");
const shellBody       = document.querySelector(".shell-body");
const brandDevTrigger = document.getElementById("brand-dev-trigger");
const devSettings     = document.getElementById("dev-settings");
const devIpHashValue  = document.getElementById("dev-ip-hash-value");
const devIpHashMeta   = document.getElementById("dev-ip-hash-meta");
const devIpHashError  = document.getElementById("dev-ip-hash-error");
const devHashRefresh  = document.getElementById("dev-hash-refresh");
const devSettingsDismiss = document.getElementById("dev-settings-dismiss");
const devHashCopy     = document.getElementById("dev-hash-copy");

// ── State ──
let currentPrompt = "";
let currentDataUrl = "";
let currentStyle = "photoreal";
let lastCompletedPendingTs = 0;
let devLogoTaps = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let devLogoTapTimer = null;
/** @type {"analyze" | "open_site"} */
let filePickIntent = "analyze";

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  const consumedPending = await checkPendingImage();
  if (!consumedPending) {
    const restoredJob = await restoreAnalysisJob();
    if (!restoredJob) {
      await restorePopupState();
    }
  }
});

async function checkPendingImage() {
  let pending;
  try {
    const result = await chrome.storage.session.get(PENDING_IMAGE_KEY);
    pending = result[PENDING_IMAGE_KEY];
  } catch {
    return false; // storage not available, show empty state
  }

  return handlePendingImage(pending);
}

async function handlePendingImage(pending) {
  if (!pending) return false;
  const ts = Number(pending.ts) || Date.now();
  if ((pending.dataUrl || pending.error) && ts === lastCompletedPendingTs) return true;

  if (pending.status === "loading") {
    showLoading("");
    return true;
  }

  chrome.storage.session.remove(PENDING_IMAGE_KEY).catch(() => {});
  lastCompletedPendingTs = ts;

  if (pending.error === "fetch_failed") {
    // Background couldn't fetch the image from the page (CORS or blocked URL).
    // Fall through to empty state and show a soft notice so user can upload manually.
    showNotice("Couldn't grab the image automatically. Upload a file instead.");
    return true;
  }

  if (pending.dataUrl) {
    saveDraftState(pending.dataUrl, currentStyle);
    showLoading(pending.dataUrl);
    await analyze(pending.dataUrl);
    return true;
  }

  return false;
}

function bindEvents() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "LITE_PENDING_IMAGE_READY") {
      void handlePendingImage(msg.pending);
    } else if (msg?.type === "LITE_ANALYSIS_JOB_UPDATED") {
      handleAnalysisJob(msg.job);
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session") {
      const pending = changes[PENDING_IMAGE_KEY]?.newValue;
      if (pending) void handlePendingImage(pending);
      return;
    }
    if (areaName === "local") {
      const job = changes[ANALYSIS_JOB_KEY]?.newValue;
      if (job) handleAnalysisJob(job);
    }
  });

  btnClosePopup?.addEventListener("click", () => {
    window.close();
  });

  btnAnalyzeDraft?.addEventListener("click", async () => {
    if (!currentDataUrl) return;
    showLoading(currentDataUrl);
    await analyze(currentDataUrl, currentStyle);
  });

  btnDraftAnother?.addEventListener("click", () => resetToEmpty());

  dropzone.addEventListener("click", () => {
    filePickIntent = "analyze";
    fileInput.click();
  });

  btnChooseFile.addEventListener("click", (e) => {
    e.stopPropagation();
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
  btnRetry.addEventListener("click", () => resetToEmpty());
  btnErrorRetry.addEventListener("click", () => resetToEmpty());

  setupBrandTapDevUnlock();
}

function scheduleDevLogoTapReset() {
  if (devLogoTapTimer) clearTimeout(devLogoTapTimer);
  devLogoTapTimer = setTimeout(() => {
    devLogoTaps = 0;
    devLogoTapTimer = null;
  }, DEV_BRAND_TAP_WINDOW_MS);
}

/** 5 taps on the logo (icon + «AI Image Describer») within 2 s unlock developer tools. */
function setupBrandTapDevUnlock() {
  brandDevTrigger?.addEventListener("click", () => {
    devLogoTaps += 1;
    scheduleDevLogoTapReset();

    if (devLogoTaps >= DEV_BRAND_TAPS_TO_UNLOCK) {
      devLogoTaps = 0;
      if (devLogoTapTimer) {
        clearTimeout(devLogoTapTimer);
        devLogoTapTimer = null;
      }
      showDevSettings();
    }
  });

  devHashRefresh?.addEventListener("click", () => void refreshDevIpHash());
  devSettingsDismiss?.addEventListener("click", () => hideDevSettings());

  devHashCopy?.addEventListener("click", async () => {
    const raw = devIpHashValue?.textContent?.trim() ?? "";
    if (!raw || raw === "Loading…") return;
    try {
      await navigator.clipboard.writeText(raw);
      const original = devHashCopy.textContent;
      devHashCopy.textContent = "Copied";
      setTimeout(() => {
        devHashCopy.textContent = original;
      }, 1500);
    } catch {
      try {
        const range = document.createRange();
        if (devIpHashValue) {
          range.selectNodeContents(devIpHashValue);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      } catch {
        /* noop */
      }
    }
  });
}

function showDevSettings() {
  if (!devSettings) return;
  devSettings.hidden = false;
  void refreshDevIpHash();
}

function hideDevSettings() {
  if (devSettings) devSettings.hidden = true;
}

async function refreshDevIpHash() {
  if (!devIpHashValue) return;

  devIpHashValue.textContent = "Loading…";
  if (devIpHashMeta) devIpHashMeta.textContent = "";
  if (devIpHashError) {
    devIpHashError.textContent = "";
    devIpHashError.hidden = true;
  }

  try {
    const res = await chrome.runtime.sendMessage({ type: "FETCH_LITE_DEV_IP_HASH" });

    const ok =
      res &&
      typeof res === "object" &&
      "ok" in res &&
      /** @type {{ ok?: boolean }} */ (res).ok === true &&
      typeof /** @type {{ ip_hash?: string }} */ (res).ip_hash === "string";

    if (!ok) {
      const errObj = res && typeof res === "object" ? /** @type {{ error?: unknown }} */ (res) : {};
      throw new Error(
        typeof errObj.error === "string" && errObj.error ? errObj.error : "request_failed",
      );
    }

    const ip_hash =
      typeof /** @type {{ ip_hash?: string }} */ (res).ip_hash === "string"
        ? /** @type {{ ip_hash: string }} */ (res).ip_hash
        : "";
    const utc =
      typeof /** @type {{ utc_day_yyyymmdd?: string }} */ (res).utc_day_yyyymmdd === "string"
        ? /** @type {{ utc_day_yyyymmdd: string }} */ (res).utc_day_yyyymmdd
        : "";
    const windowStart =
      typeof /** @type {{ window_start?: string }} */ (res).window_start === "string"
        ? /** @type {{ window_start: string }} */ (res).window_start
        : "";

    devIpHashValue.textContent = ip_hash;

    const parts = [];
    if (utc) parts.push(`UTC day ${utc}`);
    if (windowStart) parts.push(`window ${windowStart}`);
    if (devIpHashMeta) devIpHashMeta.textContent = parts.join(" · ");
  } catch (e) {
    devIpHashValue.textContent = "";
    const msg = e instanceof Error ? e.message : String(e);
    if (devIpHashError) {
      devIpHashError.textContent =
        msg && msg !== "request_failed"
          ? msg
          : "Could not fetch ip_hash. Check connection or try Refresh.";
      devIpHashError.hidden = false;
    }
  }
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

  saveDraftState(dataUrl, styleSelect?.value || "photoreal");
  showLoading(dataUrl);
  await analyze(dataUrl);
}

async function analyze(dataUrl, styleOverride) {
  const style = styleOverride || styleSelect?.value || "photoreal";
  currentDataUrl = dataUrl;
  currentStyle = style;

  try {
    const res = await chrome.runtime.sendMessage({
      type: "START_LITE_ANALYSIS",
      dataUrl,
      style,
    });
    if (!res?.ok || !res.job) {
      showFullError("Could not start analysis. Please try again.");
      return;
    }
    handleAnalysisJob(res.job);
  } catch (err) {
    console.error("[aid] start analysis failed", err?.message);
    showFullError("Could not start analysis. Please try again.");
  }
}

function isValidStyle(style) {
  return ["photoreal", "midjourney", "sd", "flux"].includes(style);
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function savePopupState(state) {
  try {
    chrome.storage.local
      .set({ [POPUP_STATE_KEY]: { ...state, ts: Date.now() } })
      .catch((e) => console.warn("[aid] popup state save failed", e));
  } catch (e) {
    console.warn("[aid] popup state save failed", e);
  }
}

function saveDraftState(dataUrl, style) {
  if (!isImageDataUrl(dataUrl)) return;
  currentDataUrl = dataUrl;
  currentStyle = isValidStyle(style) ? style : "photoreal";
  savePopupState({ kind: "draft", dataUrl, style: currentStyle });
}

function clearPopupState() {
  try {
    chrome.storage.local.remove(POPUP_STATE_KEY).catch(() => {});
  } catch {
    /* noop */
  }
}

async function restorePopupState() {
  let saved;
  try {
    const result = await chrome.storage.local.get(POPUP_STATE_KEY);
    saved = result?.[POPUP_STATE_KEY];
  } catch {
    return;
  }

  if (!saved || typeof saved !== "object" || !isImageDataUrl(saved.dataUrl)) return;

  const style = isValidStyle(saved.style) ? saved.style : "photoreal";
  if (saved.kind === "result" && typeof saved.prompt === "string" && saved.prompt) {
    showResult(saved.dataUrl, saved.prompt, style, { persist: false });
    return;
  }

  if (saved.kind === "draft") {
    showDraft(saved.dataUrl, style, { persist: false });
  }
}

async function restoreAnalysisJob() {
  let job;
  try {
    const result = await chrome.storage.local.get(ANALYSIS_JOB_KEY);
    job = result?.[ANALYSIS_JOB_KEY];
  } catch {
    return false;
  }
  return handleAnalysisJob(job);
}

function handleAnalysisJob(job) {
  if (!job || typeof job !== "object" || !isImageDataUrl(job.dataUrl)) return false;

  const style = isValidStyle(job.style) ? job.style : "photoreal";
  if (job.status === "analyzing") {
    currentDataUrl = job.dataUrl;
    currentStyle = style;
    if (styleSelect) styleSelect.value = currentStyle;
    showLoading(job.dataUrl);
    return true;
  }

  if (job.status === "result" && typeof job.prompt === "string" && job.prompt) {
    showResult(job.dataUrl, job.prompt, style);
    return true;
  }

  if (job.status === "error") {
    currentDataUrl = job.dataUrl;
    currentStyle = style;
    if (styleSelect) styleSelect.value = currentStyle;
    showFullError(getJobErrorMessage(job));
    return true;
  }

  return false;
}

function getJobErrorMessage(job) {
  if (job.error === "rate_limited" || String(job.statusCode) === "429") {
    return "Daily limit reached. Try again in 24 hours.";
  }
  if (job.error === "not_found" || job.statusCode === 404) {
    return "Service not available yet. Try again after the next deployment.";
  }
  if (job.error === "fetch_failed") {
    return "Connection failed. Check your internet connection and try again.";
  }
  return "Something went wrong. Please try another image.";
}

// ── Panel helpers ──
function showPanel(name) {
  Object.entries(panels).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
  if (shellBody) shellBody.scrollTop = 0;
}

function showDraft(dataUrl, styleUsed, opts = {}) {
  currentPrompt = "";
  currentDataUrl = dataUrl;
  currentStyle = isValidStyle(styleUsed) ? styleUsed : "photoreal";
  if (styleSelect) styleSelect.value = currentStyle;
  draftPreview.src = dataUrl;
  showPanel("draft");

  if (opts.persist !== false) {
    saveDraftState(dataUrl, currentStyle);
  }
}

function showLoading(dataUrl) {
  currentDataUrl = dataUrl;
  if (dataUrl) {
    loadingPreview.src = dataUrl;
  } else {
    loadingPreview.removeAttribute("src");
  }
  showPanel("loading");
}

function showResult(dataUrl, prompt, styleUsed, opts = {}) {
  currentPrompt = prompt;
  currentDataUrl = dataUrl;
  currentStyle = isValidStyle(styleUsed) ? styleUsed : "photoreal";
  if (styleSelect) styleSelect.value = currentStyle;
  resultPreview.src = dataUrl;
  promptBox.textContent = prompt;
  promptBox.scrollTop = 0;
  errorBanner.hidden = true;
  showPanel("result");

  if (opts.persist !== false) {
    savePopupState({ kind: "result", dataUrl, prompt, style: currentStyle });
  }

}

function resetToEmpty() {
  currentPrompt = "";
  currentDataUrl = "";
  currentStyle = styleSelect?.value || "photoreal";
  clearPopupState();
  clearAnalysisJob();
  showPanel("empty");
}

function clearAnalysisJob() {
  try {
    chrome.runtime.sendMessage({ type: "CLEAR_LITE_ANALYSIS_JOB" }).catch(() => {});
  } catch {
    /* noop */
  }
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

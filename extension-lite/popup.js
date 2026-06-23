import { prepareUploadFile } from "./lib/image-utils.js";
import { parsePromptSections, normalizePromptLayout } from "./lib/prompt-sections.js";
import { getImageBlob } from "./lib/image-store.js";
import { track } from "./lib/telemetry.js";
import {
  t,
  applyI18n,
  initI18n,
  reloadI18n,
  setUiLang,
  LITE_LOCALE_FOLDERS,
  localeOptionLabel,
  UI_LANG_STORAGE_KEY,
  tQuotaRemaining,
  tMinutesAgo,
  tHoursAgo,
  tDaysAgo,
  tStyleLabel,
} from "./lib/i18n.js";

const PENDING_IMAGE_KEY = "pending_image";
const POPUP_STATE_KEY = "extension_lite_popup_state_v1";
const ANALYSIS_JOB_KEY = "extension_lite_analysis_job_v1";
const REMIX_JOB_KEY = "extension_lite_remix_job_v1";
const QUOTA_KEY = "extension_lite_quota_v1";
const SITE_URL = "https://imageprompt.tools/";
const SITE_PRICING_URL = "https://imageprompt.tools/#stv-pricing";
const DEV_BRAND_TAP_WINDOW_MS = 2000;
const DEV_BRAND_TAPS_TO_UNLOCK = 5;
const BRAND_OPEN_SITE_DELAY_MS = 350;
const ANALYSIS_STALE_AFTER_MS = 90_000;
const REMIX_STALE_AFTER_MS = 90_000;
const DRAFT_HINT_DEFAULT = () => t("draftHint");
const ANALYSIS_TIMEOUT_MESSAGE = () => t("errorTimeout");
const UNSUPPORTED_IMAGE_MESSAGE = () => t("errorInvalidType");
const READ_FAILED_MESSAGE = () => t("errorReadFailed");
const TOO_LARGE_MESSAGE = () => t("errorTooLarge");
const NO_FILE_RECEIVED_MESSAGE = () => t("errorNoFile");

/** Clone before clearing `<input type="file">` — otherwise Chrome may invalidate the blob. */
function clonePickerFile(file) {
  const mime = file.type || "application/octet-stream";
  return new File([file.slice(0, file.size, mime)], file.name, { type: mime });
}

/** @param {string} step @param {Record<string, unknown> | undefined} data */
function uploadLog(step, data) {
  let debug = false;
  try {
    debug = localStorage.getItem("aid_upload_debug") === "1";
  } catch {
    /* noop */
  }
  if (!debug && devSettings?.hidden !== false) return;
  if (data) console.debug("[aid-upload]", step, data);
  else console.debug("[aid-upload]", step);
}

function openFilePicker() {
  if (!fileInput) return;
  uploadLog("picker open", { intent: filePickIntent });
  markFilePickerActive();
  if (typeof fileInput.showPicker === "function") {
    fileInput.showPicker();
    return;
  }
  fileInput.click();
}

// ── DOM refs ──
const panels = {
  empty:   document.getElementById("state-empty"),
  draft:   document.getElementById("state-draft"),
  loading: document.getElementById("state-loading"),
  result:  document.getElementById("state-result"),
  error:   document.getElementById("state-error"),
};

const draftPreview    = document.getElementById("draft-preview");
const draftHint       = document.getElementById("draft-hint");
const loadingPreview  = document.getElementById("loading-preview");
const resultPreview   = document.getElementById("result-preview");
const promptBox       = document.getElementById("prompt-box");
const errorBanner     = document.getElementById("error-banner");
const errorMessage    = document.getElementById("error-message");
const btnCopy         = document.getElementById("btn-copy");
const btnRetry        = document.getElementById("btn-retry");
const btnErrorRetry   = document.getElementById("btn-error-retry");
const errorGenericWrap = document.getElementById("error-generic-wrap");
const errorLimitWrap  = document.getElementById("error-limit-wrap");
const btnErrorPlans   = document.getElementById("btn-error-plans");
const btnErrorLimitDismiss = document.getElementById("btn-error-limit-dismiss");
const btnChooseFile   = document.getElementById("btn-choose-file");
const btnClosePopup   = document.getElementById("btn-close-popup");
const btnLoadingCancel = document.getElementById("btn-loading-cancel");
const btnAnalyzeDraft = document.getElementById("btn-analyze-draft");
const btnDraftAnother = document.getElementById("btn-draft-another");
const fileInput       = document.getElementById("file-input");
const dropzone        = document.getElementById("dropzone");
const stylePresetRow  = document.getElementById("style-preset-row");
const remixInput      = document.getElementById("remix-input");
const btnRemix        = document.getElementById("btn-remix");
const remixSectionRow = document.getElementById("remix-section-row");
const shellBody       = document.getElementById("body-analyze");
const bodyHistory     = document.getElementById("body-history");
const bodySettings    = document.getElementById("body-settings");
const historyList     = document.getElementById("history-list");
const historyEmpty    = document.getElementById("history-empty");
const tabBar          = document.querySelector(".tab-bar");
const shellRoot       = document.querySelector(".shell");
const brandDevTrigger = document.getElementById("brand-dev-trigger");
const devSettings     = document.getElementById("dev-settings");
const devIpHashValue  = document.getElementById("dev-ip-hash-value");
const devIpHashMeta   = document.getElementById("dev-ip-hash-meta");
const devIpHashError  = document.getElementById("dev-ip-hash-error");
const devHashRefresh  = document.getElementById("dev-hash-refresh");
const devSettingsDismiss = document.getElementById("dev-settings-dismiss");
const devHashCopy     = document.getElementById("dev-hash-copy");
const btnAuthGoogle   = document.getElementById("btn-auth-google");
const btnAuthSignOut  = document.getElementById("btn-auth-sign-out");
const topbarQuota     = document.getElementById("topbar-quota");
const uiLangSelect    = document.getElementById("ui-lang-select");
const btnSettings     = document.getElementById("btn-settings");
const activeBackdropPreview = document.getElementById("active-backdrop-preview");

// ── Style pill helpers ──
function getSelectedStyle() {
  return stylePresetRow?.querySelector(".style-pill.active")?.dataset.style || "photoreal";
}

function setSelectedStyle(value) {
  if (!stylePresetRow) return;
  for (const pill of stylePresetRow.querySelectorAll(".style-pill")) {
    const match = pill.dataset.style === value;
    pill.classList.toggle("active", match);
    pill.setAttribute("aria-checked", String(match));
  }
}

function styleLabel(style) {
  return tStyleLabel(style);
}

// ── State ──
let currentPrompt = "";
let currentPromptSections = [];
let selectedRemixSectionKey = "";
let currentDataUrl = "";
let currentStyle = "photoreal";
let isRemixing = false;
let lastCompletedPendingTs = 0;
let devLogoTaps = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let devLogoTapTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let brandOpenSiteTimer = null;
/** @type {"analyze" | "open_site"} */
let filePickIntent = "analyze";
/** Popup may unload while the native file picker is open. */
let filePickerActive = false;
/** @type {string | null} */
let activeObjectPreviewUrl = null;
let processingSelectedFile = false;
/** Funnel correlation: shared with the background job id and the backend fact row. */
let currentCorrelationId = "";
/** ids we initiated this session, awaiting a result/error to report (avoids restore double-count). */
const pendingCorrelations = new Map();

function createCorrelationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Fire result_shown / error_shown once per id we started this session. */
function reportOutcome(id, mode, kind, errorCode) {
  if (!id || !pendingCorrelations.has(id)) return;
  pendingCorrelations.delete(id);
  if (kind === "result") {
    track("result_shown", { mode, correlation_id: id });
  } else {
    track("error_shown", { mode, correlation_id: id, error_code: errorCode || "generic" });
  }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  setupLangSelect();
  applyI18n();
  document.title = t("brandWordmark");
  bindEvents();
  const consumedPending = await checkPendingImage();
  if (!consumedPending) {
    const restoredJob = await restoreAnalysisJob();
    if (!restoredJob) {
      const restoredRemix = await restoreRemixJob();
      if (!restoredRemix) {
        await restorePopupState();
      }
    }
  }
});

window.addEventListener("pagehide", () => {
  if (filePickerActive) return;
  clearActiveLoadingState();
  revokeHistoryObjectUrls();
});

function setupLangSelect() {
  if (!uiLangSelect) return;

  uiLangSelect.replaceChildren();

  const autoOpt = document.createElement("option");
  autoOpt.value = "auto";
  autoOpt.textContent = t("uiLangAuto");
  uiLangSelect.appendChild(autoOpt);

  for (const folder of LITE_LOCALE_FOLDERS) {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = localeOptionLabel(folder);
    uiLangSelect.appendChild(opt);
  }

  void chrome.storage.local.get(UI_LANG_STORAGE_KEY, (data) => {
    const stored = data?.[UI_LANG_STORAGE_KEY];
    uiLangSelect.value =
      typeof stored === "string" && stored && LITE_LOCALE_FOLDERS.includes(stored)
        ? stored
        : "auto";
  });

  uiLangSelect.addEventListener("change", () => {
    void (async () => {
      const value = uiLangSelect.value;
      await setUiLang(value);
      applyI18n();
      document.title = t("brandWordmark");
      const autoOpt = uiLangSelect.querySelector('option[value="auto"]');
      if (autoOpt) autoOpt.textContent = t("uiLangAuto");
      const signedIn = btnAuthSignOut && !btnAuthSignOut.hidden;
      applyAuthStatus({ signedIn });
      if (historyLoaded) {
        historyLoaded = false;
        await loadHistory();
      }
      const quotaText = topbarQuota?.textContent;
      if (topbarQuota && !topbarQuota.hidden && quotaText) {
        const m = quotaText.match(/^(\d+)/);
        if (m) renderQuota({ remaining: Number(m[1]), ts: Date.now() });
      }
    })();
  });
}

function setActiveBackdrop(dataUrl) {
  if (!shellRoot || !activeBackdropPreview) return;
  if (isImageDataUrl(dataUrl)) {
    activeBackdropPreview.src = dataUrl;
    shellRoot.classList.add("has-active-image");
    return;
  }
  activeBackdropPreview.removeAttribute("src");
  shellRoot.classList.remove("has-active-image");
}

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
    showNotice(t("noticeFetchFailed"));
    return true;
  }

  if (pending.dataUrl) {
    const style = isValidStyle(pending.style) ? pending.style : currentStyle;
    setSelectedStyle(style);
    saveDraftState(pending.dataUrl, style);
    showLoading(pending.dataUrl);
    await analyze(pending.dataUrl, style, pending.source === "overlay" ? "overlay" : "context_menu");
    return true;
  }

  return false;
}

function bindEvents() {
  btnSettings?.addEventListener("click", () => switchTab("settings"));

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "LITE_PENDING_IMAGE_READY") {
      void handlePendingImage(msg.pending);
    } else if (msg?.type === "LITE_ANALYSIS_JOB_UPDATED") {
      handleAnalysisJob(msg.job);
      if (msg.job?.status === "result") historyLoaded = false;
    } else if (msg?.type === "LITE_REMIX_JOB_UPDATED") {
      handleRemixJob(msg.job);
      if (msg.job?.status === "result") historyLoaded = false;
    } else if (msg?.type === "LITE_AUTH_UPDATED") {
      applyAuthStatus(msg);
    } else if (msg?.type === "LITE_UI_LANG_CHANGED") {
      void (async () => {
        await reloadI18n();
        if (uiLangSelect) {
          const stored = await chrome.storage.local.get(UI_LANG_STORAGE_KEY);
          const val = stored?.[UI_LANG_STORAGE_KEY];
          uiLangSelect.value =
            typeof val === "string" && val && LITE_LOCALE_FOLDERS.includes(val) ? val : "auto";
        }
        applyI18n();
        document.title = t("brandWordmark");
      })();
    } else if (msg?.type === "LITE_QUOTA_UPDATED") {
      renderQuota(msg);
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
      const remixJob = changes[REMIX_JOB_KEY]?.newValue;
      if (remixJob) handleRemixJob(remixJob);
    }
  });

  btnClosePopup?.addEventListener("click", () => {
    if (panels.loading?.classList.contains("active")) {
      clearActiveLoadingState();
    }
    window.close();
  });

  btnAnalyzeDraft?.addEventListener("click", async () => {
    if (!currentDataUrl) return;
    showLoading(currentDataUrl);
    await analyze(currentDataUrl, currentStyle, "draft");
  });

  btnDraftAnother?.addEventListener("click", () => resetToEmpty());

  dropzone.addEventListener("click", (e) => {
    if (e.target === btnChooseFile || btnChooseFile?.contains(/** @type {Node} */ (e.target))) return;
    if (e.target === fileInput) return;
    e.preventDefault();
    filePickIntent = "analyze";
    openFilePicker();
  });

  btnChooseFile?.addEventListener("click", (e) => {
    if (e.target === fileInput) return;
    filePickIntent = "analyze";
    markFilePickerActive();
  });


  fileInput?.addEventListener("click", () => {
    uploadLog("input click");
    markFilePickerActive();
  });

  const onFileInputSelected = () => {
    if (processingSelectedFile) return;
    filePickerActive = false;
    const file = fileInput?.files?.[0] ?? null;
    uploadLog("input change", {
      filesLength: file ? 1 : 0,
      name: file?.name,
      type: file?.type,
      size: file?.size,
    });
    if (!file) {
      if (fileInput) fileInput.value = "";
      showNotice(NO_FILE_RECEIVED_MESSAGE());
      return;
    }
    const stable = clonePickerFile(file);
    const intent = filePickIntent;
    filePickIntent = "analyze";
    void processSelectedFile(stable, intent === "open_site");
  };

  fileInput?.addEventListener("change", onFileInputSelected);
  fileInput?.addEventListener("input", onFileInputSelected);

  fileInput?.addEventListener("cancel", () => {
    uploadLog("input cancel");
    filePickerActive = false;
  });

  // Drag-and-drop on dropzone (works inside popup without unloading it)
  dropzone.addEventListener("dragenter", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragover",  (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove("drag-over");
  });
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) await ingestFile(file);
  });

  // Keyboard activation on dropzone
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      filePickIntent = "analyze";
      openFilePicker();
    }
  });

  // Paste from clipboard
  document.addEventListener("paste", async (e) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (item) {
      const file = item.getAsFile();
      if (file) await ingestFile(file);
    }
  });

  // Copy prompt
  btnCopy.addEventListener("click", async () => {
    if (!currentPrompt) return;
    track("copy_prompt", {
      surface: "result",
      correlation_id: currentCorrelationId,
      style: currentStyle,
    });
    try {
      await navigator.clipboard.writeText(currentPrompt);
      const original = btnCopy.textContent;
      btnCopy.textContent = t("copiedToClipboard");
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
  btnErrorRetry?.addEventListener("click", () => resetToEmpty());
  btnErrorLimitDismiss?.addEventListener("click", () => resetToEmpty());
  btnLoadingCancel?.addEventListener("click", () => resetToEmpty());
  btnAuthGoogle?.addEventListener("click", () => startGoogleAuth());
  btnAuthSignOut?.addEventListener("click", () => signOutGoogle());

  // Style preset pills
  stylePresetRow?.addEventListener("click", (e) => {
    const pill = /** @type {HTMLElement} */ (e.target).closest(".style-pill");
    if (!pill?.dataset.style) return;
    setSelectedStyle(pill.dataset.style);
    currentStyle = pill.dataset.style;
  });

  // Tab switching (Analyze / History)
  tabBar?.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest(".tab-btn");
    if (!btn?.dataset.tab) return;
    switchTab(btn.dataset.tab);
  });

  // Remix composer
  remixInput?.addEventListener("input", () => {
    autoGrowRemix();
    updateRemixButton();
  });
  remixInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isRemixing) return;
      void submitRemix();
    }
  });
  btnRemix?.addEventListener("click", () => void submitRemix());
  remixSectionRow?.addEventListener("click", (e) => {
    const chip = /** @type {HTMLElement} */ (e.target).closest(".remix-chip");
    if (!chip || isRemixing) return;
    const key = chip.dataset.sectionKey;
    if (key) selectRemixSection(key);
  });

  setupBrandTapDevUnlock();
  void refreshAuthStatus();
  void loadQuota();
}

async function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function applyAuthStatus(status) {
  const signedIn = status?.signedIn === true;

  if (btnAuthGoogle) btnAuthGoogle.textContent = t("signIn");
  if (btnAuthSignOut) btnAuthSignOut.textContent = t("signOut");
  if (btnAuthGoogle) btnAuthGoogle.hidden = signedIn;
  if (btnAuthSignOut) btnAuthSignOut.hidden = !signedIn;
}

async function refreshAuthStatus() {
  try {
    const res = await sendRuntimeMessage({ type: "LITE_AUTH_STATUS" });
    if (res?.ok) applyAuthStatus(res);
  } catch {
    applyAuthStatus({ signedIn: false });
  }
}

async function startGoogleAuth() {
  if (btnAuthGoogle) btnAuthGoogle.disabled = true;
  try {
    const res = await sendRuntimeMessage({ type: "LITE_AUTH_START" });
    if (!res?.ok) throw new Error(res?.error || "auth_start_failed");
  } catch (e) {
    showInlineError(t("authSignInFail"));
    console.warn("[aid] auth start failed", e);
  } finally {
    if (btnAuthGoogle) btnAuthGoogle.disabled = false;
  }
}

async function signOutGoogle() {
  try {
    const res = await sendRuntimeMessage({ type: "LITE_AUTH_SIGN_OUT" });
    if (!res?.ok) throw new Error(res?.error || "sign_out_failed");
    applyAuthStatus({ signedIn: false });
  } catch (e) {
    showInlineError(t("authSignOutFail"));
    console.warn("[aid] sign out failed", e);
  }
}

function scheduleDevLogoTapReset() {
  if (devLogoTapTimer) clearTimeout(devLogoTapTimer);
  devLogoTapTimer = setTimeout(() => {
    devLogoTaps = 0;
    devLogoTapTimer = null;
  }, DEV_BRAND_TAP_WINDOW_MS);
}

async function openBrandSite() {
  try {
    await chrome.tabs.create({ url: SITE_URL });
  } catch (e) {
    console.warn("[aid] open site failed", e);
  }
}

/** Single tap opens imageprompt.tools; 5 taps within 2 s unlock developer tools. */
function setupBrandTapDevUnlock() {
  brandDevTrigger?.addEventListener("click", () => {
    if (brandOpenSiteTimer) {
      clearTimeout(brandOpenSiteTimer);
      brandOpenSiteTimer = null;
    }

    devLogoTaps += 1;
    scheduleDevLogoTapReset();

    if (devLogoTaps >= DEV_BRAND_TAPS_TO_UNLOCK) {
      devLogoTaps = 0;
      if (devLogoTapTimer) {
        clearTimeout(devLogoTapTimer);
        devLogoTapTimer = null;
      }
      showDevSettings();
      return;
    }

    const tapsAtSchedule = devLogoTaps;
    brandOpenSiteTimer = setTimeout(() => {
      brandOpenSiteTimer = null;
      if (devLogoTaps === tapsAtSchedule && devLogoTaps === 1) {
        void openBrandSite();
      }
    }, BRAND_OPEN_SITE_DELAY_MS);
  });

  devHashRefresh?.addEventListener("click", () => void refreshDevIpHash());
  devSettingsDismiss?.addEventListener("click", () => hideDevSettings());

  devHashCopy?.addEventListener("click", async () => {
    const raw = devIpHashValue?.textContent?.trim() ?? "";
    if (!raw || raw === t("devLoading")) return;
    try {
      await navigator.clipboard.writeText(raw);
      const original = devHashCopy.textContent;
      devHashCopy.textContent = t("copied");
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

  devIpHashValue.textContent = t("devLoading");
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
          : t("devFetchError");
      devIpHashError.hidden = false;
    }
  }
}

async function processSelectedFile(file, forSite = false) {
  if (processingSelectedFile) return;
  processingSelectedFile = true;
  try {
    await ingestFile(file, { forSite });
  } finally {
    processingSelectedFile = false;
    if (fileInput) fileInput.value = "";
  }
}

function revokeActiveObjectPreview() {
  if (!activeObjectPreviewUrl) return;
  URL.revokeObjectURL(activeObjectPreviewUrl);
  activeObjectPreviewUrl = null;
}

async function ingestFile(file, { forSite = false } = {}) {
  uploadLog("ingestFile start", {
    name: file.name,
    type: file.type,
    size: file.size,
    forSite,
  });

  revokeActiveObjectPreview();
  if (!forSite) {
    clearEmptyNotice();
    activeObjectPreviewUrl = URL.createObjectURL(file);
    showLoading(activeObjectPreviewUrl);
  }

  try {
    const prepared = await prepareUploadFile(file);
    if (!prepared.ok) {
      uploadLog("ingestFile prepare failed", { error: prepared.error });
      revokeActiveObjectPreview();
      if (!forSite) showPanel("empty");
      applyPreparedUploadError(prepared.error);
      return;
    }

    revokeActiveObjectPreview();

    if (forSite) {
      try {
        const res = await chrome.runtime.sendMessage({
          type: "OPEN_SITE_WITH_IMAGE",
          dataUrl: prepared.dataUrl,
        });
        if (!res?.ok) {
          showFullError(res?.error || t("errorOpenSiteTab"));
        }
      } catch (e) {
        console.error("[aid] sendMessage failed", e);
        showFullError(t("errorOpenSite"));
      }
      uploadLog("ingestFile end", { ok: true, forSite: true });
      return;
    }

    saveDraftState(prepared.dataUrl, getSelectedStyle());
    showLoading(prepared.dataUrl);
    await analyze(prepared.dataUrl);
    uploadLog("ingestFile end", { ok: true });
  } catch (err) {
    uploadLog("ingestFile error", { message: err instanceof Error ? err.message : String(err) });
    revokeActiveObjectPreview();
    resetToEmpty();
    showInlineError(READ_FAILED_MESSAGE());
  }
}

function markFilePickerActive() {
  filePickerActive = true;
  window.setTimeout(() => {
    filePickerActive = false;
  }, 120_000);
}

function applyPreparedUploadError(error) {
  uploadLog("applyPreparedUploadError", { error });
  if (error === "too_large") {
    showInlineError(TOO_LARGE_MESSAGE());
    return;
  }
  if (error === "read_failed") {
    showInlineError(READ_FAILED_MESSAGE());
    return;
  }
  showInlineError(UNSUPPORTED_IMAGE_MESSAGE());
}

async function analyze(dataUrl, styleOverride, trigger = "upload") {
  const style = styleOverride || getSelectedStyle();
  currentDataUrl = dataUrl;
  currentStyle = style;

  const correlationId = createCorrelationId();
  track("mode_click", { mode: "analyze", trigger, correlation_id: correlationId, style });

  try {
    const res = await chrome.runtime.sendMessage({
      type: "START_LITE_ANALYSIS",
      dataUrl,
      style,
      correlationId,
    });
    if (!res?.ok || !res.job) {
      track("request_start_error", {
        mode: "analyze",
        correlation_id: correlationId,
        style,
        error_code: "start_failed",
      });
      showFullError(t("errorStartAnalysis"));
      return;
    }
    currentCorrelationId = res.job.id || correlationId;
    pendingCorrelations.set(currentCorrelationId, "analyze");
    track("request_start_ok", { mode: "analyze", correlation_id: currentCorrelationId, style });
    handleAnalysisJob(res.job);
  } catch (err) {
    console.error("[aid] start analysis failed", err?.message);
    track("request_start_error", {
      mode: "analyze",
      correlation_id: correlationId,
      style,
      error_code: "exception",
    });
    showFullError(t("errorStartAnalysis"));
  }
}

function autoGrowRemix() {
  if (!remixInput) return;
  remixInput.style.height = "auto";
  remixInput.style.height = Math.min(remixInput.scrollHeight, 54) + "px";
}

function updateRemixButton() {
  if (!btnRemix) return;
  const hasText = Boolean(remixInput?.value.trim());
  btnRemix.disabled = !hasText || isRemixing || !selectedRemixSectionKey;
}

function getSelectedPromptSection() {
  return currentPromptSections.find((s) => s.key === selectedRemixSectionKey) ?? null;
}

function renderRemixSectionChips() {
  if (!remixSectionRow) return;
  remixSectionRow.replaceChildren();
  for (const section of currentPromptSections) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "remix-chip";
    btn.role = "radio";
    btn.dataset.sectionKey = section.key;
    btn.textContent = section.chipLabel;
    btn.setAttribute("aria-checked", section.key === selectedRemixSectionKey ? "true" : "false");
    if (section.key === selectedRemixSectionKey) btn.classList.add("is-selected");
    btn.disabled = isRemixing;
    remixSectionRow.appendChild(btn);
  }
}

function focusPromptSection(section) {
  if (!promptBox || !section || !currentPrompt) return;

  const applyScroll = () => {
    promptBox.classList.remove("section-focused");
    void promptBox.offsetWidth;
    promptBox.classList.add("section-focused");

    const offset = Math.min(Math.max(section.start, 0), currentPrompt.length);
    let targetScroll = 0;

    const textNode = promptBox.firstChild;
    if (textNode?.nodeType === Node.TEXT_NODE && textNode.length > 0) {
      const range = document.createRange();
      const end = Math.min(offset + 1, textNode.length);
      range.setStart(textNode, offset);
      range.setEnd(textNode, end);
      const marker = range.getBoundingClientRect();
      if (marker.height > 0 || marker.width > 0) {
        const boxTop = promptBox.getBoundingClientRect().top;
        targetScroll = marker.top - boxTop + promptBox.scrollTop - 10;
      }
    }

    if (targetScroll <= 0 && offset > 0) {
      const lineHeight = parseFloat(getComputedStyle(promptBox).lineHeight) || 19;
      const lineIndex =
        typeof section.lineIndex === "number"
          ? section.lineIndex
          : currentPrompt.slice(0, offset).split("\n").length - 1;
      targetScroll = lineIndex * lineHeight;
    }

    const maxScroll = Math.max(0, promptBox.scrollHeight - promptBox.clientHeight);
    promptBox.scrollTop = Math.min(Math.max(0, targetScroll), maxScroll);
  };

  requestAnimationFrame(applyScroll);
  window.setTimeout(() => promptBox?.classList.remove("section-focused"), 900);
}

function selectRemixSection(key, { focusPrompt = true } = {}) {
  if (!currentPromptSections.some((s) => s.key === key)) return;
  selectedRemixSectionKey = key;
  renderRemixSectionChips();
  if (focusPrompt) focusPromptSection(getSelectedPromptSection());
  updateRemixButton();
}

function syncPromptSections({ focusPrompt = false } = {}) {
  const prevKey = selectedRemixSectionKey;
  currentPromptSections = parsePromptSections(currentPrompt);
  if (prevKey && currentPromptSections.some((s) => s.key === prevKey)) {
    selectedRemixSectionKey = prevKey;
  } else if (currentPromptSections.length > 0) {
    selectedRemixSectionKey = currentPromptSections[0].key;
  } else {
    selectedRemixSectionKey = "";
  }
  renderRemixSectionChips();
  if (focusPrompt && selectedRemixSectionKey) {
    focusPromptSection(getSelectedPromptSection());
  }
  updateRemixButton();
}

function setRemixing(on) {
  isRemixing = on;
  if (promptBox) promptBox.classList.toggle("is-remixing", on);
  if (remixInput) remixInput.disabled = on;
  if (btnRemix) {
    btnRemix.classList.toggle("is-busy", on);
    btnRemix.disabled = on || !remixInput?.value.trim() || !selectedRemixSectionKey;
  }
  if (remixSectionRow) {
    for (const chip of remixSectionRow.querySelectorAll(".remix-chip")) {
      /** @type {HTMLButtonElement} */ (chip).disabled = on;
    }
  }
}

function flashRemixed() {
  if (!promptBox) return;
  promptBox.classList.remove("just-remixed");
  void promptBox.offsetWidth; // reflow to restart animation
  promptBox.classList.add("just-remixed");
}

async function submitRemix() {
  const changeRequest = remixInput?.value.trim() ?? "";
  if (!currentPrompt || !changeRequest || changeRequest.length > 1000) return;

  let selectedSection = getSelectedPromptSection();
  if (!selectedSection) {
    syncPromptSections();
    selectedSection = getSelectedPromptSection();
  }
  if (!selectedSection) {
    showInlineError(t("remixSelectSectionError"));
    return;
  }

  clearRemixJob();
  setRemixing(true);
  if (errorBanner) errorBanner.hidden = true;

  const correlationId = createCorrelationId();
  track("mode_click", {
    mode: "remix",
    trigger: "remix_submit",
    correlation_id: correlationId,
    style: currentStyle,
    detail: { section: selectedSection.key },
  });

  try {
    const res = await sendRuntimeMessage({
      type: "START_LITE_REMIX",
      originalPrompt: currentPrompt,
      sectionKey: selectedSection.key,
      sectionLabel: selectedSection.label,
      sectionText: selectedSection.text,
      sectionHeading: selectedSection.heading,
      changeRequest,
      style: currentStyle,
      dataUrl: currentDataUrl,
      correlationId,
    });

    if (!res?.ok || !res.job) {
      track("request_start_error", {
        mode: "remix",
        correlation_id: correlationId,
        style: currentStyle,
        error_code: "start_failed",
      });
      showInlineError(t("remixError"));
      setRemixing(false);
      return;
    }

    currentCorrelationId = res.job.id || correlationId;
    pendingCorrelations.set(currentCorrelationId, "remix");
    track("request_start_ok", {
      mode: "remix",
      correlation_id: currentCorrelationId,
      style: currentStyle,
    });

    if (!handleRemixJob(res.job)) {
      showInlineError(t("remixError"));
      setRemixing(false);
    }
  } catch (err) {
    console.warn("[aid] remix start failed", err);
    track("request_start_error", {
      mode: "remix",
      correlation_id: correlationId,
      style: currentStyle,
      error_code: "exception",
    });
    showInlineError(t("remixError"));
    setRemixing(false);
  }
}

async function restoreRemixJob() {
  let job;
  try {
    const result = await chrome.storage.local.get(REMIX_JOB_KEY);
    job = result?.[REMIX_JOB_KEY];
  } catch {
    return false;
  }
  if (job?.status === "remixing") {
    const lastTouched = Number(job.updatedAt || job.createdAt || 0);
    if (lastTouched > 0 && Date.now() - lastTouched > REMIX_STALE_AFTER_MS) {
      clearRemixJob();
      return false;
    }
    void sendRuntimeMessage({ type: "RESUME_LITE_REMIX_JOB" }).catch(() => {});
  }
  return handleRemixJob(job);
}

function clearRemixJob() {
  try {
    chrome.storage.local.remove(REMIX_JOB_KEY).catch(() => {});
  } catch {
    // ignore
  }
  try {
    chrome.runtime.sendMessage({ type: "CLEAR_LITE_REMIX_JOB" }).catch(() => {});
  } catch {
    // ignore
  }
}

function handleRemixJob(job) {
  if (!job || typeof job !== "object" || typeof job.originalPrompt !== "string") return false;

  const style = isValidStyle(job.style) ? job.style : "photoreal";
  const dataUrl = isImageDataUrl(job.dataUrl) ? job.dataUrl : currentDataUrl;

  if (job.status === "remixing") {
    if (dataUrl) {
      showResult(dataUrl, job.originalPrompt, style, { persist: false });
    }
    setRemixing(true);
    const lastTouched = Number(job.updatedAt || job.createdAt || 0);
    if (lastTouched > 0 && Date.now() - lastTouched > REMIX_STALE_AFTER_MS) {
      clearRemixJob();
      setRemixing(false);
      showInlineError(t("remixError"));
      return true;
    }
    return true;
  }

  if (job.status === "result" && typeof job.prompt === "string" && job.prompt) {
    setRemixing(false);
    if (remixInput) {
      remixInput.value = "";
      autoGrowRemix();
    }
    if (dataUrl) {
      showResult(dataUrl, job.prompt, style);
    } else {
      currentPrompt = job.prompt;
      if (promptBox) promptBox.textContent = job.prompt;
    }
    flashRemixed();
    historyLoaded = false;
    if (typeof job.remaining === "number") {
      renderQuota({ remaining: job.remaining, ts: Date.now() });
    }
    reportOutcome(job.id, "remix", "result");
    clearRemixJob();
    return true;
  }

  if (job.status === "error") {
    setRemixing(false);
    if (dataUrl) {
      showResult(dataUrl, job.originalPrompt, style, { persist: false });
    }
    const rateLimited = job.error === "rate_limited" || String(job.statusCode) === "429";
    if (rateLimited) {
      showRateLimitError();
    } else {
      showInlineError(t("remixError"));
    }
    reportOutcome(job.id, "remix", "error", rateLimited ? "rate_limited" : job.error || "generic");
    clearRemixJob();
    return true;
  }

  return false;
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
    setSelectedStyle(currentStyle);
    const lastTouched = Number(job.updatedAt || job.createdAt || 0);
    if (lastTouched > 0 && Date.now() - lastTouched > ANALYSIS_STALE_AFTER_MS) {
      clearAnalysisJob();
      showDraft(job.dataUrl, style, { persist: false, hint: t("draftHintStale") });
      return true;
    }
    showLoading(job.dataUrl);
    return true;
  }

  if (job.status === "result" && typeof job.prompt === "string" && job.prompt) {
    showResult(job.dataUrl, job.prompt, style);
    reportOutcome(job.id, "analyze", "result");
    return true;
  }

  if (job.status === "error") {
    currentDataUrl = job.dataUrl;
    currentStyle = style;
    setSelectedStyle(currentStyle);
    const rateLimited = job.error === "rate_limited" || String(job.statusCode) === "429";
    if (rateLimited) {
      showRateLimitError();
    } else {
      showFullError(getJobErrorMessage(job));
    }
    reportOutcome(job.id, "analyze", "error", rateLimited ? "rate_limited" : job.error || "generic");
    return true;
  }

  return false;
}

function getJobErrorMessage(job) {
  if (job.error === "rate_limited" || String(job.statusCode) === "429") {
    return t("errorRateLimited");
  }
  if (job.error === "not_found" || job.statusCode === 404) {
    return t("errorNotFound");
  }
  if (job.error === "fetch_failed") {
    return t("errorConnection");
  }
  if (job.error === "timeout" || job.error === "AbortError" || job.error === "TimeoutError") {
    return ANALYSIS_TIMEOUT_MESSAGE();
  }
  return t("errorGeneric");
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
  setSelectedStyle(currentStyle);
  if (draftHint) draftHint.textContent = opts.hint || DRAFT_HINT_DEFAULT();
  draftPreview.src = dataUrl;
  setActiveBackdrop(dataUrl);
  showPanel("draft");

  if (opts.persist !== false) {
    saveDraftState(dataUrl, currentStyle);
  }
}

function showLoading(dataUrl) {
  uploadLog("showLoading", { hasPreview: Boolean(dataUrl) });
  const candidate = isImageDataUrl(dataUrl) ? dataUrl : currentDataUrl;
  if (isImageDataUrl(candidate)) {
    currentDataUrl = candidate;
    loadingPreview.src = candidate;
    setActiveBackdrop(candidate);
  } else {
    currentDataUrl = "";
    loadingPreview.removeAttribute("src");
  }
  showPanel("loading");
}

function showResult(dataUrl, prompt, styleUsed, opts = {}) {
  promptBox.classList.remove("is-remixing", "just-remixed", "section-focused");
  prompt = normalizePromptLayout(prompt);
  currentPrompt = prompt;
  currentDataUrl = dataUrl;
  currentStyle = isValidStyle(styleUsed) ? styleUsed : "photoreal";
  setSelectedStyle(currentStyle);
  resultPreview.src = dataUrl;
  setActiveBackdrop(dataUrl);
  promptBox.textContent = prompt;
  promptBox.scrollTop = 0;
  errorBanner.hidden = true;
  showPanel("result");
  syncPromptSections({ focusPrompt: false });

  if (opts.persist !== false) {
    savePopupState({ kind: "result", dataUrl, prompt, style: currentStyle });
  }

}

function resetToEmpty() {
  revokeActiveObjectPreview();
  currentPrompt = "";
  currentDataUrl = "";
  currentStyle = getSelectedStyle();
  clearPopupState();
  clearAnalysisJob();
  setActiveBackdrop("");
  showPanel("empty");
}

function clearActiveLoadingState() {
  if (!panels.loading?.classList.contains("active")) return;
  currentPrompt = "";
  currentDataUrl = "";
  clearPopupState();
  try {
    chrome.storage.local.remove(ANALYSIS_JOB_KEY).catch(() => {});
  } catch {
    /* noop */
  }
  clearAnalysisJob();
}

function clearAnalysisJob() {
  try {
    chrome.runtime.sendMessage({ type: "CLEAR_LITE_ANALYSIS_JOB" }).catch(() => {});
  } catch {
    /* noop */
  }
}

function showRateLimitError() {
  if (errorGenericWrap) errorGenericWrap.hidden = true;
  if (errorLimitWrap) errorLimitWrap.hidden = false;
  if (btnErrorPlans instanceof HTMLAnchorElement) btnErrorPlans.href = SITE_PRICING_URL;
  showPanel("error");
  void refreshQuotaFromServer();
}

async function refreshQuotaFromServer() {
  try {
    const res = await sendRuntimeMessage({ type: "FETCH_LITE_QUOTA" });
    if (res?.ok && res.quota) {
      renderQuota(res.quota);
      return;
    }
  } catch {
    /* noop */
  }
  renderQuota({ remaining: 0, ts: Date.now() });
}

function showFullError(message) {
  if (errorLimitWrap) errorLimitWrap.hidden = true;
  if (errorGenericWrap) errorGenericWrap.hidden = false;
  if (errorMessage) errorMessage.textContent = message;
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

function clearEmptyNotice() {
  const notice = document.getElementById("empty-notice");
  if (notice) {
    notice.textContent = "";
    notice.hidden = true;
  }
}

// ── Tab switching ──
function switchTab(tab) {
  if (!tabBar) return;
  for (const btn of tabBar.querySelectorAll(".tab-btn")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  const isHistory = tab === "history";
  const isSettings = tab === "settings";
  if (shellBody) shellBody.hidden = isHistory || isSettings;
  if (bodyHistory) bodyHistory.hidden = !isHistory;
  if (bodySettings) bodySettings.hidden = !isSettings;
  if (isHistory) void loadHistory();
}

// ── Quota counter ──
function isQuotaFresh(quota) {
  if (!quota || typeof quota.ts !== "number") return false;
  const now = new Date();
  const saved = new Date(quota.ts);
  return (
    now.getUTCFullYear() === saved.getUTCFullYear() &&
    now.getUTCMonth() === saved.getUTCMonth() &&
    now.getUTCDate() === saved.getUTCDate()
  );
}

function renderQuota(quota) {
  if (!topbarQuota) return;
  if (!quota || typeof quota.remaining !== "number" || !isQuotaFresh(quota)) {
    topbarQuota.hidden = true;
    topbarQuota.className = "topbar-quota";
    return;
  }
  const { remaining } = quota;
  const low = remaining <= 3;
  topbarQuota.className = "topbar-quota" + (low ? " quota-low" : "");
  topbarQuota.textContent = tQuotaRemaining(remaining);
  topbarQuota.hidden = false;
}

async function loadQuota() {
  await refreshQuotaFromServer();
}

// ── History ──
let historyLoaded = false;
let historyObjectUrls = [];

async function loadHistory() {
  if (historyLoaded) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_LITE_HISTORY" });
    if (res?.ok && Array.isArray(res.entries)) {
      renderHistoryList(res.entries);
    }
  } catch {
    /* noop */
  }
  historyLoaded = true;
}

function revokeHistoryObjectUrls() {
  for (const url of historyObjectUrls) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
  historyObjectUrls = [];
}

function renderHistoryList(entries) {
  if (!historyList || !historyEmpty) return;
  revokeHistoryObjectUrls();
  historyList.innerHTML = "";
  const valid = entries.filter(
    (e) => e && typeof e.prompt === "string" && e.prompt,
  );
  if (valid.length === 0) {
    historyEmpty.hidden = false;
    return;
  }
  historyEmpty.hidden = true;

  for (const entry of valid) {
    const card = document.createElement("div");
    card.className = "history-card";

    const inlineSrc =
      entry.image?.mode === "data_url" && entry.image.dataUrl
        ? entry.image.dataUrl
        : entry.image?.mode === "image_url" && entry.image.imageUrl
          ? entry.image.imageUrl
          : "";

    const styleLabelText = styleLabel(entry.style) || entry.style || "";
    const timeStr = formatRelativeTime(entry.createdAt);

    card.innerHTML = `
      <img class="history-card-thumb" src="${inlineSrc}" alt="" loading="lazy"${inlineSrc ? "" : " hidden"} />
      <div class="history-card-body">
        <div class="history-card-meta">
          ${styleLabelText ? `<span class="history-card-style">${styleLabelText}</span>` : ""}
          ${timeStr ? `<span class="history-card-time">${timeStr}</span>` : ""}
        </div>
        <p class="history-card-prompt">${escapeHtml(entry.prompt)}</p>
        <div class="history-card-actions">
          <button type="button" class="history-card-copy">${t("historyCopy")}</button>
        </div>
      </div>
    `;

    if (!inlineSrc && entry.image?.mode === "idb" && entry.image.refId) {
      const imgEl = card.querySelector(".history-card-thumb");
      if (imgEl) {
        void getImageBlob(entry.image.refId).then((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          historyObjectUrls.push(url);
          imgEl.src = url;
          imgEl.hidden = false;
        });
      }
    }

    const copyBtn = card.querySelector(".history-card-copy");
    copyBtn?.addEventListener("click", async () => {
      track("copy_prompt", { surface: "history", style: entry.style });
      try {
        await navigator.clipboard.writeText(entry.prompt);
        copyBtn.textContent = t("copiedExclaim");
        setTimeout(() => { copyBtn.textContent = t("historyCopy"); }, 1500);
      } catch { /* noop */ }
    });

    historyList.appendChild(card);
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("timeJustNow");
  if (mins < 60) return tMinutesAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tHoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return tDaysAgo(days);
  return date.toLocaleDateString();
}

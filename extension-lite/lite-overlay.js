/**
 * Компактный язычок на левом краю фото (только hover).
 * Клик сразу открывает toolbar popup расширения.
 */

const MIN_RENDERED_SIZE = 100;
const FAB_WIDTH = 32;
const FAB_HEIGHT = 40;
const SHOW_DELAY_MS = 70;
const HIDE_DELAY_MS = 220;
const HOVER_PAD_MIN_PX = 0;
const HOVER_PAD_MAX_PX = 0;
const HOVER_PAD_RATIO = 0;
const POINTER_MOVE_THROTTLE_MS = 20;
const DRAG_CLICK_PX = 8;
const OBSERVER_DEBOUNCE_MS = 200;

const STORAGE_KEY = "lite_overlay_fab_pos_v1";

/** Deep link shown when the analyze API returns rate_limited (429). */
const SITE_PRICING_URL = "https://imageprompt.tools/#stv-pricing";

/** @typedef {{ anchorY: number, anchorRatio: number | null }} SavedFabState */

if (typeof chrome === "undefined" || !chrome.runtime?.id || window.self !== window.top) {
  void 0;
} else {
  initLiteOverlay().catch((err) => {
    console.error("[extension-lite overlay] init failed", err);
  });
}

async function initLiteOverlay() {
  /** @type {typeof import("./lib/i18n.js") | null} */
  let i18nMod = null;
  /** @type {typeof import("./lib/lexygpt-promo.js") | null} */
  let lexygptPromoMod = null;

  /** @param {string} key @param {string | string[] | undefined} [substitutions] */
  function t(key, substitutions) {
    return i18nMod?.t(key, substitutions) ?? key;
  }

  function getLoadedLocale() {
    return i18nMod?.getLoadedLocale() ?? "en";
  }

  function isLexyGptPromoVisible() {
    return lexygptPromoMod?.isLexyGptPromoVisible?.() ?? getLoadedLocale() === "ru";
  }

  async function bootstrapI18n() {
    try {
      i18nMod = await import(chrome.runtime.getURL("lib/i18n.js"));
      await i18nMod.initI18n();
      lexygptPromoMod = await import(chrome.runtime.getURL("lib/lexygpt-promo.js"));
      refreshOverlayLocale();
    } catch (err) {
      console.warn("[extension-lite overlay] i18n unavailable", err);
    }
  }

  function bindI18nListeners() {
    if (!i18nMod) return;

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "LITE_UI_LANG_CHANGED") {
        void i18nMod.reloadI18n().then(refreshOverlayLocale);
      }
      return false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[i18nMod.UI_LANG_STORAGE_KEY]) {
        void i18nMod.reloadI18n().then(refreshOverlayLocale);
      }
    });
  }

  const iconUrl =
    typeof chrome.runtime.getURL === "function"
      ? chrome.runtime.getURL("icons/icon-widget-star.png")
      : "";

  /** @type {HTMLElement | null} */
  let shadowHost = null;
  /** @type {ShadowRoot | null} */
  let shadowRootRef = null;

  /** @type {HTMLElement | null} */
  let fabShell = null;
  /** @type {HTMLElement | null} */
  let fabClip = null;

  /** @type {HTMLElement | null} */
  let modalBackdrop = null;
  /** @type {(state: string) => void} */
  let setModalUiState = () => {};

  /** @type {SavedFabState} */
  let saved = { anchorY: 16, anchorRatio: null };

  /** @type {HTMLImageElement | null} */
  let activeImg = null;
  /** @type {IntersectionObserver | null} */
  let activeImgObserver = null;
  let showTimer = null;
  /** @type {HTMLImageElement | null} */
  let pendingShowImg = null;
  let hideTimer = null;
  let lastPointerMoveTs = 0;
  let layoutRafId = 0;

  let repositioning = false;
  /** @type {{ anchorY: number; sx: number; sy: number } | null} */
  let repositionStart = null;

  /** @type {"idle" | "reposition"} */
  let fabGesture = "idle";

  let suppressFabClick = false;

  await loadSavedState();

  function loadSavedState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORAGE_KEY, (data) => {
          if (chrome.runtime.lastError) {
            console.warn("[extension-lite overlay] storage read", chrome.runtime.lastError.message);
          }
          const raw = data?.[STORAGE_KEY];
          if (raw && typeof raw.anchorY === "number") {
            saved.anchorY = raw.anchorY;
          }
          if (raw && typeof raw.anchorRatio === "number" && Number.isFinite(raw.anchorRatio)) {
            saved.anchorRatio = Math.min(Math.max(raw.anchorRatio, 0), 1);
          }
          resolve(undefined);
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  function persistState() {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: { ...saved } }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* noop */
    }
  }

  function clampAnchorYForRect(rect, anchorY) {
    const maxH = Math.max(0, rect.height - FAB_HEIGHT);
    return Math.min(Math.max(0, anchorY), maxH);
  }

  function getAnchorYForRect(rect) {
    const maxH = Math.max(0, rect.height - FAB_HEIGHT);
    if (typeof saved.anchorRatio === "number") {
      return Math.min(Math.max(0, Math.round(maxH * saved.anchorRatio)), maxH);
    }
    return clampAnchorYForRect(rect, saved.anchorY);
  }

  function clampAnchorY() {
    if (!activeImg) return saved.anchorY;
    return getAnchorYForRect(activeImg.getBoundingClientRect());
  }

  function setAnchorYForActiveImage(anchorY) {
    if (!activeImg) {
      saved.anchorY = Math.max(0, anchorY);
      return;
    }
    const r = activeImg.getBoundingClientRect();
    const maxH = Math.max(0, r.height - FAB_HEIGHT);
    const clamped = clampAnchorYForRect(r, anchorY);
    saved.anchorY = clamped;
    saved.anchorRatio = maxH > 0 ? clamped / maxH : 0;
  }

  function applyFabLayout() {
    if (!fabShell || !fabClip || !activeImg) return;
    const r = activeImg.getBoundingClientRect();
    const left = r.left;
    const anchorY = getAnchorYForRect(r);
    const top = r.top + anchorY;

    fabShell.style.left = `${Math.round(left)}px`;
    fabShell.style.top = `${Math.round(top)}px`;
  }

  function scheduleFabLayout() {
    if (layoutRafId) return;
    layoutRafId = requestAnimationFrame(() => {
      layoutRafId = 0;
      applyFabLayout();
    });
  }

  function cancelScheduledFabLayout() {
    if (!layoutRafId) return;
    cancelAnimationFrame(layoutRafId);
    layoutRafId = 0;
  }

  /** @type {string | null} */
  let modalBuiltForLocale = null;

  function destroyModal() {
    if (modalBackdrop) {
      modalBackdrop.remove();
      modalBackdrop = null;
    }
    modalBuiltForLocale = null;
    modalPreviewImg = null;
    modalPromptPre = null;
    modalAuthTitle = null;
    modalAuthSubtitle = null;
    modalAuthBtn = null;
    modalSignOutBtn = null;
    modalErrorEl = null;
    modalErrorGeneric = null;
    modalErrorLimit = null;
    modalLimitPlans = null;
    modalErrorActions = null;
    modalAnalyzeBtn = null;
    modalCopyBtn = null;
    modalGenerateBtn = null;
    modalRetryAnalyzeBtn = null;
    modalErrorCloseBtn = null;
    modalLimitDismissBtn = null;
    setModalUiState = () => {};
  }

  function refreshOverlayLocale() {
    destroyModal();
    if (fabShell) fabShell.setAttribute("aria-label", t("fabAriaLabel"));
  }

  function ensureModalBuilt() {
    if (!shadowRootRef) return;
    const locale = getLoadedLocale();
    if (modalBackdrop && modalBuiltForLocale === locale) return;
    destroyModal();
    buildModal(shadowRootRef);
    modalBuiltForLocale = locale;
  }

  function modalOpen() {
    return !!(modalBackdrop && modalBackdrop.hidden === false);
  }

  /** @typedef {{ ok: boolean; dataUrl?: string; error?: string; prompt?: string; status?: number }} MsgRes */

  /** @returns {Promise<MsgRes>} */
  function sendBg(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          if (chrome.runtime.lastError) {
            const errMsg = String(chrome.runtime.lastError.message || "");
            const invalidated =
              errMsg.includes("invalidated") || errMsg.includes("Extension context");
            resolve({ ok: false, error: invalidated ? "context_invalidated" : errMsg });
            return;
          }
          resolve(res && typeof res === "object" ? res : { ok: false });
        });
      } catch {
        resolve({ ok: false, error: "no_runtime" });
      }
    });
  }

  /** @typedef {{ id: string; createdAt: string; style: string; prompt: string; image: { mode: string; dataUrl: string }}}} LiteHist */
  /** @returns {LiteHist} */
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

  /** @returns {LiteHist[]} */
  function sendHistory(entry) {
    void sendBg("LITE_HISTORY_APPEND", { entry });
  }

  function setFabVisible(show) {
    ensureDom();
    if (!fabShell) return;
    fabShell.classList.toggle("lite-fab-visible", show);
  }

  async function openAnalyzeModalFromFab() {
    if (!activeImg) return;

    const imageUrl = getBestImageUrl(activeImg);
    if (!imageUrl || !imageUrl.startsWith("http")) return;
    const res = await sendBg("LITE_OVERLAY_OPEN_TOOLBAR_POPUP", { srcUrl: imageUrl });
    if (!res.ok) {
      // Никаких дублирующих in-page popup: при ошибке просто оставляем FAB в текущем состоянии.
      console.warn("[extension-lite overlay] toolbar popup open failed:", res.error || "unknown_error");
    }
  }

  function handleModalAnalyzeClick() {
    const dataUrl = /** @type {string} */ (getModalDataUrl());
    const style = getModalStyle();
    if (!dataUrl) return;

    setModalUiState("analyzing");

    void (async () => {
      /** @type {MsgRes & { prompt?: string; status?: number }} */
      const r = /** @type {any} */ (await sendBg("LITE_OVERLAY_ANALYZE", { dataUrl, style }));

      if (r.ok && typeof r.prompt === "string") {
        setModalResult(dataUrl, r.prompt, style);
        sendHistory(createLiteHistoryEntry(dataUrl, style, r.prompt));
        return;
      }

      let msg = t("errorGenericOverlay");
      /** @type {"generic" | "rate_limited"} */
      let errKind = "generic";
      if (r.error === "rate_limited" || String(r.status) === "429") {
        errKind = "rate_limited";
        msg = t("errorRateLimited");
      } else if (r.error === "not_found" || r.status === 404) {
        msg = t("errorNotFoundShort");
      } else if (r.error === "fetch_failed") {
        msg = t("errorConnectionShort");
      } else if (r.error === "context_invalidated") {
        msg = t("errorContextInvalidated");
      }

      const rateLimited = errKind === "rate_limited";
      showModalError(msg, {
        kind: rateLimited ? "rate_limited" : "generic",
        retryable: !rateLimited && r.error !== "context_invalidated",
      });
    })();
  }

  let modalPreviewImg = /** @type {HTMLImageElement | null} */ (null);
  let modalPromptPre = /** @type {HTMLElement | null} */ (null);
  let modalErrorEl = /** @type {HTMLElement | null} */ (null);
  let modalErrorGeneric = /** @type {HTMLElement | null} */ (null);
  let modalErrorLimit = /** @type {HTMLElement | null} */ (null);
  let modalLimitPlans = /** @type {HTMLAnchorElement | null} */ (null);
  let modalErrorActions = /** @type {HTMLElement | null} */ (null);
  let modalLimitDismissBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalAnalyzeBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalCopyBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalGenerateBtn = /** @type {HTMLAnchorElement | null} */ (null);
  let modalRetryAnalyzeBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalErrorCloseBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalAuthTitle = /** @type {HTMLElement | null} */ (null);
  let modalAuthSubtitle = /** @type {HTMLElement | null} */ (null);
  let modalAuthBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalSignOutBtn = /** @type {HTMLButtonElement | null} */ (null);
  let modalSignedIn = false;
  /** @type {string} */
  let modalCurrentDataUrl = "";
  /** @type {string} */
  let modalCurrentPrompt = "";

  /** @typedef {"loading" | "ready" | "analyzing" | "result" | "error"} ModalPanel */

  /** @returns {HTMLElement | null} */
  function q(root, sel) {
    const el = root.querySelector(sel);
    return el instanceof HTMLElement ? el : null;
  }

  function buildModal(root) {
    const lexyGenerateHtml = isLexyGptPromoVisible()
      ? `<a class="lite-primary-btn lite-generate-btn" href="${lexygptPromoMod?.LEXYGPT_REF_URL ?? "https://lexygpt.com/playground/image/nano-banana-pro?ref=T25A8Y_add"}" target="_blank" rel="noopener noreferrer">${lexygptPromoMod?.LEXYGPT_BTN_LABEL ?? "Сгенерировать"}</a>`
      : "";

    modalBackdrop = document.createElement("div");
    modalBackdrop.className = "lite-modal-backdrop";
    modalBackdrop.hidden = true;
    modalBackdrop.setAttribute("role", "presentation");

    modalBackdrop.innerHTML = `
      <div class="lite-modal-card" role="dialog" aria-modal="true" aria-label="${t("modalAria")}">
        <header class="lite-modal-head">
          <span class="lite-modal-title">${t("brandWordmark")}</span>
          <button type="button" class="lite-modal-close" aria-label="${t("modalClose")}">&times;</button>
        </header>
        <div class="lite-modal-body">
          <section class="lite-auth-card" aria-label="Account">
            <div class="lite-auth-copy">
              <p class="lite-auth-title">${t("authGuest")}</p>
              <p class="lite-auth-subtitle">${t("authHint")}</p>
            </div>
            <button type="button" class="lite-primary-btn lite-auth-btn">${t("authSignIn")}</button>
            <button type="button" class="lite-secondary-btn lite-auth-sign-out lite-hidden">${t("signOut")}</button>
          </section>
          <div class="lite-panel" data-lite-panel="loading">
            <p class="lite-modal-status">${t("readingImage")}</p>
          </div>
          <div class="lite-panel lite-hidden" data-lite-panel="ready">
            <div class="lite-modal-preview-frame">
              <img class="lite-modal-preview-img" alt="" draggable="false" />
            </div>
            <button type="button" class="lite-primary-btn lite-analyze-btn">${t("analyzeBtn")}</button>
          </div>
          <div class="lite-panel lite-hidden" data-lite-panel="analyzing">
            <div class="lite-modal-preview-frame">
              <img class="lite-analyzing-thumb" alt="" draggable="false" />
            </div>
            <p class="lite-modal-status">${t("analyzing")}</p>
          </div>
          <div class="lite-panel lite-hidden" data-lite-panel="result">
            <div class="lite-modal-preview-frame lite-small-prev">
              <img class="lite-result-thumb" alt="" draggable="false" />
            </div>
            <pre class="lite-prompt-out" spellcheck="false"></pre>
            <div class="lite-result-actions">
              ${lexyGenerateHtml}
              <button type="button" class="lite-secondary-btn lite-copy-btn">${t("copyPrompt")}</button>
            </div>
          </div>
          <div class="lite-panel lite-hidden" data-lite-panel="error">
            <div class="lite-error-generic">
              <p class="lite-modal-err-msg"></p>
            </div>
            <div class="lite-error-limit lite-hidden">
              <div class="lite-limit-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" opacity="0.35" />
                  <path d="M12 7v5l3.5 2" opacity="0.95" />
                </svg>
              </div>
              <p class="lite-limit-title">${t("limitTitle")}</p>
              <p class="lite-limit-desc">${t("limitDescription")}</p>
              <p class="lite-limit-meta">${t("limitMetaOverlay")}</p>
            </div>
            <div class="lite-error-actions">
              <a class="lite-primary-btn lite-limit-plans lite-hidden" href="${SITE_PRICING_URL}" target="_blank" rel="noopener noreferrer">${t("limitViewPlans")}</a>
              <button type="button" class="lite-secondary-btn lite-retry-analyze-btn lite-hidden">${t("retryAnalyze")}</button>
              <button type="button" class="lite-primary-btn lite-retry-ready-btn lite-hidden">${t("closeBtn")}</button>
              <button type="button" class="lite-secondary-btn lite-limit-dismiss lite-hidden">${t("limitGotIt")}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const card = modalBackdrop.querySelector(".lite-modal-card");
    if (card) {
      card.addEventListener("click", (e) => e.stopPropagation());
    }

    const closeBtns = modalBackdrop.querySelectorAll(".lite-modal-close, .lite-retry-ready-btn, .lite-limit-dismiss");
    closeBtns.forEach((b) =>
      b.addEventListener("click", () => {
        closeModal();
      }),
    );

    modalPreviewImg = /** @type {HTMLImageElement | null} */ (modalBackdrop.querySelector(".lite-modal-preview-img"));

    modalPromptPre = q(modalBackdrop, ".lite-prompt-out");
    modalAuthTitle = q(modalBackdrop, ".lite-auth-title");
    modalAuthSubtitle = q(modalBackdrop, ".lite-auth-subtitle");
    modalAuthBtn = /** @type {HTMLButtonElement | null} */ (modalBackdrop.querySelector(".lite-auth-btn"));
    modalSignOutBtn = /** @type {HTMLButtonElement | null} */ (modalBackdrop.querySelector(".lite-auth-sign-out"));

    modalErrorEl = q(modalBackdrop, ".lite-modal-err-msg");
    modalErrorGeneric = q(modalBackdrop, ".lite-error-generic");
    modalErrorLimit = q(modalBackdrop, ".lite-error-limit");
    modalLimitPlans = /** @type {HTMLAnchorElement | null} */ (modalBackdrop.querySelector(".lite-limit-plans"));
    modalErrorActions = q(modalBackdrop, ".lite-error-actions");

    modalAnalyzeBtn = /** @type {HTMLButtonElement | null} */ (modalBackdrop.querySelector(".lite-analyze-btn"));

    modalCopyBtn = /** @type {HTMLButtonElement | null} */ (modalBackdrop.querySelector(".lite-copy-btn"));
    modalGenerateBtn = /** @type {HTMLAnchorElement | null} */ (modalBackdrop.querySelector(".lite-generate-btn"));
    modalRetryAnalyzeBtn = /** @type {HTMLButtonElement | null} */ (
      modalBackdrop.querySelector(".lite-retry-analyze-btn")
    );
    modalErrorCloseBtn = /** @type {HTMLButtonElement | null} */ (
      modalBackdrop.querySelector(".lite-retry-ready-btn")
    );
    modalLimitDismissBtn = /** @type {HTMLButtonElement | null} */ (
      modalBackdrop.querySelector(".lite-limit-dismiss")
    );

    modalAnalyzeBtn?.addEventListener("click", handleModalAnalyzeClick);
    modalRetryAnalyzeBtn?.addEventListener("click", handleModalAnalyzeClick);
    modalAuthBtn?.addEventListener("click", () => void startModalAuth());
    modalSignOutBtn?.addEventListener("click", () => void signOutModalAuth());

    modalCopyBtn?.addEventListener("click", async () => {
      if (!modalCurrentPrompt) return;
      try {
        await navigator.clipboard.writeText(modalCurrentPrompt);
        const prevLabel = modalCopyBtn.textContent;
        modalCopyBtn.textContent = t("copied");
        setTimeout(() => {
          modalCopyBtn.textContent = prevLabel || t("copyPrompt");
        }, 1600);
      } catch {
        /* noop */
      }
    });

    modalGenerateBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (!modalCurrentPrompt) return;
      void lexygptPromoMod?.openLexyGptWithPrompt(modalCurrentPrompt);
    });

    const panels /** @type {Record<ModalPanel, HTMLElement>} */ = {
      loading: /** @type {HTMLElement} */ (modalBackdrop.querySelector('[data-lite-panel="loading"]')),
      ready: /** @type {HTMLElement} */ (modalBackdrop.querySelector('[data-lite-panel="ready"]')),
      analyzing: /** @type {HTMLElement} */ (modalBackdrop.querySelector('[data-lite-panel="analyzing"]')),
      result: /** @type {HTMLElement} */ (modalBackdrop.querySelector('[data-lite-panel="result"]')),
      error: /** @type {HTMLElement} */ (modalBackdrop.querySelector('[data-lite-panel="error"]')),
    };

    setModalUiState = /** @param {ModalPanel} name */ function setModalUiStateInner(name) {
      for (const [k, el] of /** @type {const} */ ([
        ["loading", panels.loading],
        ["ready", panels.ready],
        ["analyzing", panels.analyzing],
        ["result", panels.result],
        ["error", panels.error],
      ])) {
        el.classList.toggle("lite-hidden", k !== name);
      }
      if (name !== "error") {
        for (const sel of /** @type {const} */ [
          ".lite-retry-ready-btn",
          ".lite-limit-dismiss",
          ".lite-limit-plans",
          ".lite-retry-analyze-btn",
        ]) {
          const el = modalBackdrop?.querySelector(sel);
          if (el instanceof HTMLElement) el.classList.add("lite-hidden");
        }
      }
      const retryBtn = modalBackdrop?.querySelector(".lite-retry-analyze-btn");
      if (retryBtn instanceof HTMLElement && name !== "error") {
        retryBtn.classList.add("lite-hidden");
      }
      if (name === "analyzing") {
        const thumb = modalBackdrop.querySelector(".lite-analyzing-thumb");
        if (thumb instanceof HTMLImageElement && modalCurrentDataUrl) thumb.src = modalCurrentDataUrl;
      }
    };

    root.appendChild(modalBackdrop);
  }

  function applyModalAuthStatus(status) {
    modalSignedIn = status?.signedIn === true;
    const label =
      typeof status?.email === "string" && status.email
        ? status.email
        : typeof status?.name === "string" && status.name
          ? status.name
          : "";
    if (modalAuthTitle) modalAuthTitle.textContent = modalSignedIn ? t("authSignedIn") : t("authGuest");
    if (modalAuthSubtitle) {
      modalAuthSubtitle.textContent = modalSignedIn
        ? label || t("authSignedInHint")
        : t("authHint");
    }
    modalAuthBtn?.classList.toggle("lite-hidden", modalSignedIn);
    modalSignOutBtn?.classList.toggle("lite-hidden", !modalSignedIn);
  }

  async function refreshModalAuthStatus() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "LITE_AUTH_STATUS" });
      if (res?.ok) applyModalAuthStatus(res);
    } catch {
      applyModalAuthStatus({ signedIn: false });
    }
  }

  async function startModalAuth() {
    try {
      if (modalAuthBtn) modalAuthBtn.disabled = true;
      const res = await chrome.runtime.sendMessage({ type: "LITE_AUTH_START" });
      if (!res?.ok) throw new Error(res?.error || "auth_start_failed");
    } catch {
      showModalError(t("authSignInFail"), { retryable: false });
    } finally {
      if (modalAuthBtn) modalAuthBtn.disabled = false;
    }
  }

  async function signOutModalAuth() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "LITE_AUTH_SIGN_OUT" });
      if (!res?.ok) throw new Error(res?.error || "sign_out_failed");
      applyModalAuthStatus({ signedIn: false });
    } catch {
      showModalError(t("authSignOutFail"), { retryable: false });
    }
  }

  function showModal() {
    ensureDom();
    ensureModalBuilt();
    if (!modalBackdrop) return;
    modalBackdrop.hidden = false;
    void refreshModalAuthStatus();
  }

  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.hidden = true;
    modalCurrentDataUrl = "";
    modalCurrentPrompt = "";
  }

  function showModalError(msg, opts = {}) {
    const isLimit = opts.kind === "rate_limited";
    if (modalErrorGeneric) modalErrorGeneric.classList.toggle("lite-hidden", isLimit);
    if (modalErrorLimit) modalErrorLimit.classList.toggle("lite-hidden", !isLimit);
    if (!isLimit && modalErrorEl) modalErrorEl.textContent = msg;

    const retryable = !isLimit && opts.retryable === true && !!modalCurrentDataUrl;
    if (modalRetryAnalyzeBtn) modalRetryAnalyzeBtn.classList.toggle("lite-hidden", !retryable);
    if (modalLimitPlans) modalLimitPlans.classList.toggle("lite-hidden", !isLimit);

    if (isLimit) {
      if (modalErrorCloseBtn) modalErrorCloseBtn.classList.add("lite-hidden");
      if (modalLimitDismissBtn) modalLimitDismissBtn.classList.remove("lite-hidden");
    } else {
      if (modalLimitDismissBtn) modalLimitDismissBtn.classList.add("lite-hidden");
      if (modalErrorCloseBtn) modalErrorCloseBtn.classList.remove("lite-hidden");
    }

    if (modalErrorActions) modalErrorActions.classList.toggle("lite-error-actions-stack", !!isLimit);

    setModalUiState("error");
  }

  /** @param {string} dataUrl */
  function setModalPreviewAndData(dataUrl) {
    modalCurrentDataUrl = dataUrl;
    if (modalPreviewImg) modalPreviewImg.src = dataUrl;
  }

  function getModalDataUrl() {
    return modalCurrentDataUrl;
  }

  function getModalStyle() {
    return "photoreal";
  }

  /** @param {string} dataUrl @param {string} prompt */
  function setModalResult(dataUrl, prompt, _styleUsed) {
    modalCurrentPrompt = prompt;
    const img = modalBackdrop?.querySelector(".lite-result-thumb");
    if (img instanceof HTMLImageElement) img.src = dataUrl;
    if (modalPromptPre) modalPromptPre.textContent = prompt;
    setModalUiState("result");
  }

  function ensureDom() {
    if (shadowHost) return;

    shadowHost = document.createElement("div");
    shadowHost.id = "lite-aid-shadow-host";
    Object.assign(shadowHost.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    document.documentElement.appendChild(shadowHost);

    const root = shadowHost.attachShadow({ mode: "open" });
    shadowRootRef = root;

    const styleEl = document.createElement("style");
    styleEl.textContent = cssText();
    root.append(styleEl);

    fabShell = document.createElement("div");
    fabShell.className = "lite-fab-shell";
    fabShell.setAttribute("role", "button");
    fabShell.setAttribute("aria-label", t("fabAriaLabel"));
    fabShell.tabIndex = -1;

    fabClip = document.createElement("div");
    fabClip.className = "lite-fab-clip";

    const borderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    borderSvg.setAttribute("class", "lite-fab-border");
    borderSvg.setAttribute("viewBox", "0 0 32 40");
    borderSvg.setAttribute("aria-hidden", "true");
    borderSvg.innerHTML =
      '<defs><linearGradient id="liteFabBorderGradient" x1="4" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse"><stop stop-color="#6366f1" /><stop offset="1" stop-color="#8b5cf6" /></linearGradient></defs><path d="M0 0 H20 A12 12 0 0 1 32 12 V28 A12 12 0 0 1 20 40 H0 V0" pathLength="100" />';

    const inner = document.createElement("div");
    inner.className = "lite-fab-inner";

    const fabIcon = document.createElement("img");
    fabIcon.className = "lite-fab-icon";
    fabIcon.src = iconUrl || "";
    fabIcon.alt = "";
    fabIcon.draggable = false;

    inner.appendChild(fabIcon);
    fabClip.appendChild(borderSvg);
    fabClip.appendChild(inner);
    fabShell.appendChild(fabClip);
    root.appendChild(fabShell);

    fabShell.addEventListener(
      "pointerdown",
      (e) => {
        if (!fabShell?.classList.contains("lite-fab-visible")) return;
        if (modalOpen()) return;
        if (e.button !== 0) return;

        fabGesture = "reposition";
        fabShell.setPointerCapture(e.pointerId);
        repositioning = false;
        repositionStart = {
          anchorY: clampAnchorY(),
          sx: e.clientX,
          sy: e.clientY,
        };
      },
      true,
    );

    fabShell.addEventListener(
      "pointermove",
      (e) => {
        if (!fabShell?.classList.contains("lite-fab-visible")) return;
        if (modalOpen()) return;

        if (fabGesture === "reposition" && repositionStart) {
          const dx = e.clientX - repositionStart.sx;
          const dy = e.clientY - repositionStart.sy;
          if (Math.abs(dx) > DRAG_CLICK_PX || Math.abs(dy) > DRAG_CLICK_PX) {
            repositioning = true;
          }
          setAnchorYForActiveImage(repositionStart.anchorY + dy);
          applyFabLayout();
        }
      },
      true,
    );

    fabShell.addEventListener(
      "pointerup",
      (e) => {
        if (!fabShell) return;

        if (fabGesture === "reposition" && repositionStart) {
          try {
            fabShell.releasePointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          fabGesture = "idle";
          repositionStart = null;
          if (repositioning) {
            suppressFabClick = true;
            persistState();
            repositioning = false;
          }
        }
      },
      true,
    );

    fabShell.addEventListener(
      "pointercancel",
      (e) => {
        if (!fabShell) return;
        fabGesture = "idle";
        applyFabLayout();
        repositionStart = null;
        repositioning = false;
        try {
          fabShell.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      },
      true,
    );

    fabShell.addEventListener(
      "click",
      (e) => {
        if (!fabShell?.classList.contains("lite-fab-visible")) return;
        if (modalOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        if (suppressFabClick) {
          suppressFabClick = false;
          return;
        }
        void openAnalyzeModalFromFab();
      },
      true,
    );

    window.addEventListener(
      "scroll",
      () => {
        if (fabShell?.classList.contains("lite-fab-visible")) scheduleFabLayout();
      },
      { capture: true, passive: true },
    );
    window.addEventListener("resize", () => {
      if (fabShell?.classList.contains("lite-fab-visible")) scheduleFabLayout();
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && modalOpen()) {
          closeModal();
        }
      },
      true,
    );

  }

  /** @returns {boolean} */
  function isOverlayRelatedTarget(rt) {
    if (!shadowHost || !(rt instanceof Element)) return false;
    if (shadowHost === rt || shadowRootRef?.contains(rt)) return true;
    return false;
  }

  function getHoverPadPx(rect) {
    const m = Math.min(rect.width, rect.height);
    return Math.min(
      HOVER_PAD_MAX_PX,
      Math.max(HOVER_PAD_MIN_PX, Math.round(m * HOVER_PAD_RATIO)),
    );
  }

  /** @returns {boolean} */
  function pointerNearActiveUi(clientX, clientY) {
    if (!activeImg) return false;
    const r = activeImg.getBoundingClientRect();
    const pad = getHoverPadPx(r);
    const inImg =
      clientX >= r.left - pad &&
      clientX <= r.right + pad &&
      clientY >= r.top - pad &&
      clientY <= r.bottom + pad;
    if (inImg) return true;

    if (fabShell?.classList.contains("lite-fab-visible")) {
      /** Hit box: clipped width + full height */
      const bx = r.left;
      const by = r.top + clampAnchorY();
      const bp = 10;
      if (
        clientX >= bx - bp &&
        clientX <= bx + FAB_WIDTH + bp &&
        clientY >= by - bp &&
        clientY <= by + FAB_HEIGHT + bp
      ) {
        return true;
      }
    }
    return false;
  }

  function onGlobalMove(e) {
    if (!activeImg) return;
    const now = Date.now();
    if (now - lastPointerMoveTs < POINTER_MOVE_THROTTLE_MS) return;
    lastPointerMoveTs = now;
    pointerNearActiveUi(e.clientX, e.clientY) ? cancelHide() : scheduleHide();
    if (fabShell?.classList.contains("lite-fab-visible")) scheduleFabLayout();
  }

  function scheduleHide() {
    if (!fabShell?.classList.contains("lite-fab-visible")) {
      clearPendingShow();
      return;
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideButton, HIDE_DELAY_MS);
  }

  function cancelHide() {
    clearTimeout(hideTimer);
  }

  function clearPendingShow() {
    clearTimeout(showTimer);
    pendingShowImg = null;
  }

  function hideButton() {
    clearPendingShow();
    if (activeImgObserver) {
      activeImgObserver.disconnect();
      activeImgObserver = null;
    }
    cancelScheduledFabLayout();
    activeImg = null;
    setFabVisible(false);
  }

  function watchActiveImg(img) {
    if (activeImgObserver) {
      activeImgObserver.disconnect();
      activeImgObserver = null;
    }
    if (typeof IntersectionObserver !== "function") return;
    activeImgObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && !entry.isIntersecting) hideButton();
      },
      { threshold: 0.1 },
    );
    activeImgObserver.observe(img);
  }

  function scheduleShow(img) {
    if (!isEligible(img)) return;
    cancelHide();
    if (activeImg === img && fabShell?.classList.contains("lite-fab-visible")) {
      scheduleFabLayout();
      return;
    }
    clearPendingShow();
    pendingShowImg = img;
    showTimer = setTimeout(() => {
      if (pendingShowImg !== img || !isEligible(img)) return;
      pendingShowImg = null;
      activeImg = img;
      watchActiveImg(img);
      ensureDom();
      applyFabLayout();
      setFabVisible(true);
    }, SHOW_DELAY_MS);
  }

  /** @returns {HTMLImageElement | null} */
  function coerceImgTarget(target) {
    if (!(target instanceof Element)) return null;
    if (target instanceof HTMLImageElement && isEligible(target)) return target;
    const fromClosest = target.closest("img");
    if (fromClosest instanceof HTMLImageElement && isEligible(fromClosest)) return fromClosest;
    const nested = target.querySelector("img");
    if (nested instanceof HTMLImageElement && isEligible(nested)) return nested;
    return null;
  }

  function parseSrcset(srcset) {
    return srcset
      .split(",")
      .map((p) => p.trim())
      .map((candidate) => {
        const parts = candidate.split(/\s+/);
        const url = /** @type {string | undefined} */ (parts[0]);
        const w = Number((parts[1] || "0w").replace(/[^\d]/g, ""));
        return { url: url || "", width: Number.isFinite(w) ? w : 0 };
      })
      .filter((v) => !!v.url);
  }

  function getBestImageUrl(img) {
    if (!img.srcset) return img.currentSrc || img.src || null;
    try {
      const sorted = parseSrcset(img.srcset).sort((a, b) => b.width - a.width);
      if (sorted[0]?.url) return sorted[0].url;
    } catch {
      /* noop */
    }
    return img.currentSrc || img.src || null;
  }

  function isSvgImageUrl(url) {
    if (!url) return false;
    const pathOnly = url.split("#")[0]?.split("?")[0]?.toLowerCase() || "";
    return pathOnly.endsWith(".svg");
  }

  function isEligible(img) {
    if (!img || img.tagName !== "IMG") return false;
    const rect = img.getBoundingClientRect();
    const w = Math.ceil(rect.width);
    const h = Math.ceil(rect.height);
    if (w < MIN_RENDERED_SIZE || h < MIN_RENDERED_SIZE) return false;
    const src = getBestImageUrl(img);
    if (!src || !src.startsWith("http")) return false;
    if (isSvgImageUrl(src)) return false;

    if (
      img.closest(
        "nav,header,footer,[role=navigation],[role=banner],[role=contentinfo]",
      )
    )
      return false;

    return true;
  }

  /** @type {WeakSet<HTMLImageElement>} */
  const listened = new WeakSet();

  /** @param {HTMLImageElement} img */
  function attachToImg(img) {
    if (listened.has(img)) return;
    listened.add(img);

    img.addEventListener(
      "mouseenter",
      () => {
        scheduleShow(img);
      },
      { passive: true },
    );

    img.addEventListener(
      "mouseleave",
      (e) => {
        if (isOverlayRelatedTarget(/** @type {EventTarget|null} */ (e.relatedTarget))) return;
        scheduleHide();
      },
      { passive: true },
    );
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (shadowHost?.contains(t) || shadowRootRef?.contains(t)) return;
      const img = coerceImgTarget(t);
      if (img) scheduleShow(img);
    },
    { capture: true, passive: true },
  );

  document.addEventListener("mousemove", onGlobalMove, { capture: true, passive: true });

  let mutationTimer = null;

  function processAdded(nodes) {
    for (const node of nodes) {
      if (node instanceof HTMLImageElement) {
        attachToImg(node);
      } else if (node instanceof HTMLElement) {
        node.querySelectorAll("img").forEach((child) => {
          attachToImg(/** @type {HTMLImageElement} */ (child));
        });
      }
    }
  }

  const mo = new MutationObserver((mutations) => {
    clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(() => {
      const nodes = [];
      for (const m of mutations) {
        for (const n of m.addedNodes) nodes.push(n);
      }
      processAdded(nodes);
    }, OBSERVER_DEBOUNCE_MS);
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });

  document.querySelectorAll("img").forEach((node) =>
    attachToImg(/** @type {HTMLImageElement} */ (node)),
  );

  void bootstrapI18n().then(bindI18nListeners);
}

/** @returns {string} */
function cssText() {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    .lite-fab-shell {
      position: fixed;
      width: 32px;
      height: 40px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      pointer-events: auto;
      cursor: pointer;
      outline: none;
      z-index: 2;
      opacity: 0;
      visibility: hidden;
      transform: translate3d(-8px, 0, 0) scale(0.98);
      transition:
        opacity 0.16s ease,
        visibility 0.16s ease,
        transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .lite-fab-shell.lite-fab-visible {
      opacity: 1;
      visibility: visible;
      transform: translate3d(0, 0, 0) scale(1);
    }
    .lite-fab-shell:focus-visible {
      outline: 2px solid rgb(129 140 248 / 0.55);
      outline-offset: 2px;
    }
    .lite-fab-clip {
      position: relative;
      width: 32px;
      height: 40px;
      overflow: hidden;
      border-radius: 0 12px 12px 0;
      border: 1px solid rgba(0, 0, 0, 0.08);
      background: #ffffff;
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.8);
      transform-origin: left center;
      transition:
        box-shadow 0.2s ease,
        border-color 0.15s ease,
        transform 0.09s ease;
    }
    .lite-fab-border {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .lite-fab-border path {
      fill: none;
      stroke: url(#liteFabBorderGradient);
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 11 89;
      stroke-dashoffset: 0;
    }
    .lite-fab-clip:hover {
      border-color: transparent;
      box-shadow:
        0 4px 16px rgba(139, 92, 246, 0.12),
        0 2px 10px rgba(0, 0, 0, 0.1);
    }
    .lite-fab-shell:active .lite-fab-clip {
      transform: scale(0.98);
    }
    .lite-fab-clip:hover .lite-fab-border {
      opacity: 1;
    }
    .lite-fab-clip:hover .lite-fab-border path {
      animation: liteBorderRun 1.15s linear infinite;
    }
    .lite-fab-inner {
      width: 32px;
      height: 40px;
      display: grid;
      place-items: center;
      position: relative;
      z-index: 2;
    }
    .lite-fab-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
      display: block;
      transform: translateX(-2px);
      pointer-events: none;
    }
    @keyframes liteBorderRun {
      to {
        stroke-dashoffset: -100;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .lite-fab-shell {
        transition: opacity 0.12s ease, visibility 0.12s ease;
        transform: none;
      }
      .lite-fab-shell.lite-fab-visible {
        transform: none;
      }
      .lite-fab-clip:hover .lite-fab-border {
        opacity: 1;
      }
      .lite-fab-clip:hover .lite-fab-border path {
        animation: none;
        stroke-dasharray: 100;
        stroke-dashoffset: 0;
      }
    }
    .lite-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.52);
      display: grid;
      place-items: center;
      pointer-events: auto;
      z-index: 10;
      padding: 16px;
    }
    .lite-modal-backdrop[hidden] {
      display: none !important;
    }
    .lite-modal-card {
      width: min(460px, 100%);
      max-height: min(88vh, 720px);
      background: #09090b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: #fafafa;
      box-shadow:
        0 18px 50px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(99, 102, 241, 0.12);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .lite-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      flex-shrink: 0;
    }
    .lite-modal-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .lite-modal-close {
      border: none;
      background: transparent;
      color: #a1a1aa;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .lite-modal-close:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
    }
    .lite-modal-body {
      padding: 12px;
      overflow: auto;
    }
    .lite-auth-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
      padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      background: rgba(39, 39, 42, 0.45);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    }
    .lite-auth-title {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #a1a1aa;
    }
    .lite-auth-subtitle {
      margin: 2px 0 0;
      font-size: 11px;
      line-height: 1.35;
      color: #71717a;
      word-break: break-word;
    }
    .lite-panel.lite-hidden { display: none; }
    .lite-modal-status {
      margin: 0;
      padding: 8px 0;
      font-size: 13px;
      color: #d4d4d8;
    }
    .lite-modal-preview-frame {
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #050506;
      margin-bottom: 10px;
    }
    .lite-modal-preview-frame.lite-small-prev {
      max-height: 120px;
      margin-bottom: 8px;
    }
    .lite-modal-preview-img,
    .lite-analyzing-thumb,
    .lite-result-thumb {
      display: block;
      width: 100%;
      max-height: min(260px, 40vh);
      object-fit: contain;
    }
    .lite-result-thumb {
      max-height: 112px;
    }
    .lite-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #a1a1aa;
    }
    .lite-select {
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(24, 24, 27, 0.9);
      color: #fafafa;
      font-size: 13px;
      padding: 8px 10px;
    }
    .lite-primary-btn {
      border: none;
      border-radius: 9px;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      margin-top: 4px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: #fff;
    }
    .lite-primary-btn:hover {
      filter: brightness(1.06);
    }
    .lite-secondary-btn {
      border-radius: 9px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid rgba(255, 255,255, 0.12);
      background: transparent;
      color: #fafafa;
    }
    .lite-prompt-out {
      margin: 0 0 10px;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255, 0.08);
      background: rgba(255,255,255, 0.04);
      color: #e4e4e7;
      font-size: 12px;
      line-height: 1.35;
      max-height: 38vh;
      overflow: auto;
      white-space: pre-wrap;
    }
    .lite-result-actions {
      display: flex;
      justify-content: stretch;
      gap: 8px;
    }
    .lite-error-actions {
      display: flex;
      gap: 8px;
    }
    .lite-error-actions .lite-secondary-btn,
    .lite-error-actions .lite-primary-btn {
      flex: 1;
    }
    .lite-copy-btn {
      flex: 1;
    }
    .lite-generate-btn {
      flex: 1;
      margin-top: 0;
      width: auto;
      background: linear-gradient(180deg, #16a34a, #15803d);
      border: 1px solid rgba(34, 197, 94, 0.66);
    }
    .lite-generate-btn:hover {
      filter: brightness(1.06);
    }
    .lite-modal-err-msg {
      margin: 0;
      padding: 10px 0;
      font-size: 13px;
      color: #fecaca;
      line-height: 1.35;
    }
    .lite-error-limit {
      text-align: center;
      padding: 6px 2px 4px;
    }
    .lite-limit-icon {
      margin: 0 auto 12px;
      width: 48px;
      height: 48px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(139, 92, 246, 0.35);
      color: #a5b4fc;
    }
    .lite-limit-title {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 650;
      color: #fafafa;
      letter-spacing: -0.01em;
      line-height: 1.3;
    }
    .lite-limit-desc {
      margin: 0 0 10px;
      font-size: 13px;
      line-height: 1.45;
      color: #a1a1aa;
    }
    .lite-limit-meta {
      margin: 0 0 4px;
      font-size: 12px;
      line-height: 1.35;
      color: #71717a;
    }
    a.lite-primary-btn {
      display: block;
      box-sizing: border-box;
      text-align: center;
      text-decoration: none;
      line-height: 1.25;
    }
    .lite-error-actions-stack {
      flex-direction: column;
      align-items: stretch;
      margin-top: 8px;
    }
    .lite-error-actions-stack .lite-primary-btn,
    .lite-error-actions-stack .lite-secondary-btn {
      flex: none;
      width: 100%;
    }
`;
}

/**
 * Runs on imageprompt.tools (and localhost) at document_start.
 * Moves a pending payload from extension session storage into page sessionStorage
 * so PromptSceneLiteWidget can pick it up and auto-analyze.
 */
const SESSION_KEY = "extension_lite_pending";
const STORAGE_KEY = "extension_lite_web_pending";

chrome.storage.session.get(STORAGE_KEY, (data) => {
  const payload = data?.[STORAGE_KEY];
  if (!payload) return;

  chrome.storage.session.remove(STORAGE_KEY, () => {
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
});

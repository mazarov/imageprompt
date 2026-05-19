/**
 * Runs on imageprompt.tools (and localhost) at document_start.
 * Pending image is stored in chrome.storage.session by the service worker; content
 * scripts cannot reliably read session storage, so we request the payload via
 * runtime messaging, then mirror it into page sessionStorage for PromptSceneLiteWidget.
 */
const SESSION_KEY = "extension_lite_pending";

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

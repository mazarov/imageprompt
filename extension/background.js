const STORAGE_KEY = "pendingVibe";
const AUTH_PENDING_KEY = "ip_pending_auth_exchange";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

/* OAuth finish tab wrote the exchange code; open side panel so onChanged/boot can consume it. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const ch = changes[AUTH_PENDING_KEY];
  if (!ch?.newValue || typeof ch.newValue !== "string" || !ch.newValue.trim()) return;
  chrome.windows.getLastFocused({ populate: false }, (w) => {
    if (chrome.runtime.lastError || !w?.id) return;
    chrome.sidePanel.open({ windowId: w.id }).catch(() => {});
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "STEAL_VIBE") return false;

  const tabId = sender.tab?.id;
  if (!tabId || typeof message.imageUrl !== "string" || !message.imageUrl.startsWith("http")) {
    sendResponse({ ok: false, error: "invalid_payload" });
    return false;
  }

  const vibePayload = {
    imageUrl: message.imageUrl,
    pageUrl: message.pageUrl || "",
    pageTitle: message.pageTitle || "",
    at: Date.now()
  };

  chrome.storage.session.set({ [STORAGE_KEY]: vibePayload }, () => {
    chrome.sidePanel
      .open({ tabId })
      .then(() =>
        /* After panel is open, SW → extension page delivery is reliable; session.onChanged often misses */
        chrome.runtime.sendMessage({ type: "STV_PENDING_VIBE", vibe: vibePayload }).catch(() => {})
      )
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
  });

  return true;
});

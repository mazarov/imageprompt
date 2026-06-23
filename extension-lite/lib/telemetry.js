/**
 * Client funnel telemetry for analyze/remix.
 * Fire-and-forget events sent to /api/extension/events via sendBeacon
 * (survives popup unload) with a fetch(keepalive) fallback.
 *
 * No PII is sent: the server derives ip_hash itself; user_id is resolved
 * from the app JWT passed as `t` (same token already used for analyze).
 */
import { getUiLanguage } from "./i18n.js";

const EVENTS_URL = "https://imageprompt.tools/api/extension/events";
const APP_JWT_STORAGE_KEY = "ip_app_jwt";
const CLIENT_SOURCE = "extension_lite";

const SESSION_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const EXT_VERSION = (() => {
  try {
    return chrome.runtime.getManifest().version || "";
  } catch {
    return "";
  }
})();

let platformOs = "";
try {
  chrome.runtime.getPlatformInfo?.((info) => {
    platformOs = info?.os || "";
  });
} catch {
  /* noop */
}

const BROWSER = (() => {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/Edg\//.test(ua)) return "edge";
  if (/OPR\//.test(ua)) return "opera";
  if (/Brave\//.test(ua) || (typeof navigator !== "undefined" && navigator.brave)) return "brave";
  if (/Vivaldi/.test(ua)) return "vivaldi";
  if (/Chrome\//.test(ua)) return "chrome";
  return "other";
})();

// Cache the app JWT so per-event beacons can attribute a user without an async read.
let tokenCache = "";
try {
  chrome.storage.local.get(APP_JWT_STORAGE_KEY, (data) => {
    const v = data?.[APP_JWT_STORAGE_KEY];
    if (typeof v === "string") tokenCache = v;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[APP_JWT_STORAGE_KEY]) return;
    const v = changes[APP_JWT_STORAGE_KEY].newValue;
    tokenCache = typeof v === "string" ? v : "";
  });
} catch {
  /* noop */
}

function currentLocale() {
  try {
    return getUiLanguage() || "";
  } catch {
    return "";
  }
}

function send(payload) {
  const body = JSON.stringify(payload);
  try {
    const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon && navigator.sendBeacon(EVENTS_URL, blob)) {
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch(EVENTS_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      mode: "no-cors",
    }).catch(() => {});
  } catch {
    /* noop */
  }
}

/**
 * @param {string} event one of the server-side ClientEventName values
 * @param {Record<string, unknown>} [fields] mode|trigger|correlation_id|style|surface|error_code|detail
 */
export function track(event, fields = {}) {
  if (!event) return;
  const { detail, ...rest } = fields;
  send({
    v: 1,
    ...(tokenCache ? { t: tokenCache } : {}),
    ctx: {
      session_id: SESSION_ID,
      locale: currentLocale(),
      platform: platformOs,
      browser: BROWSER,
      ext_version: EXT_VERSION,
      client_source: CLIENT_SOURCE,
    },
    events: [
      {
        event,
        client_ts: new Date().toISOString(),
        ...rest,
        ...(detail && typeof detail === "object" ? { detail } : {}),
      },
    ],
  });
}

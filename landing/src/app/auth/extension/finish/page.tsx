"use client";

import { useEffect } from "react";

const MSG_TYPE = "IMAGEPROMPT_AUTH_EXCHANGE";
/** DOM CustomEvent type: crosses page ↔ isolated content-script boundary reliably (postMessage alone can still miss). */
const DOM_EVENT = "imageprompt-tools-auth-exchange";

export default function AuthExtensionFinishPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("c");
    if (!code) return;

    function emit() {
      try {
        document.dispatchEvent(
          new CustomEvent(DOM_EVENT, {
            bubbles: true,
            composed: true,
            detail: { code },
          }),
        );
      } catch {
        /* ignore */
      }
      try {
        window.postMessage({ type: MSG_TYPE, code }, "*");
      } catch {
        /* ignore */
      }
    }

    const t0 = window.setTimeout(emit, 0);
    const t1 = window.setTimeout(emit, 80);
    const t2 = window.setTimeout(emit, 400);

    const closeT = window.setTimeout(() => {
      window.close();
    }, 2500);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(closeT);
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: "2rem",
        textAlign: "center",
        color: "#e4e4e7",
        background: "#18181b",
        minHeight: "100vh",
      }}
    >
      <p>Signing in to the extension… You can close this tab.</p>
    </div>
  );
}

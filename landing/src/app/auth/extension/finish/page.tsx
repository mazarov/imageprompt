"use client";

import { useEffect } from "react";

const MSG_TYPE = "IMAGEPROMPT_AUTH_EXCHANGE";

export default function AuthExtensionFinishPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("c");
    if (!code) return;

    /* Defer so content script listener is definitely attached; target "*" — relay validates event.origin. */
    const postT = window.setTimeout(() => {
      window.postMessage({ type: MSG_TYPE, code }, "*");
    }, 0);

    const closeT = window.setTimeout(() => {
      window.close();
    }, 1500);

    return () => {
      window.clearTimeout(postT);
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

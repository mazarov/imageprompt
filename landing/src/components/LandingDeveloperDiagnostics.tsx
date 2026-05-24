"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";

type DevIpPayload = {
  ip_hash: string;
  window_start?: string;
  utc_day_yyyymmdd?: string;
};

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function LandingDeveloperDiagnostics({ visible, onDismiss }: Props) {
  const t = useTranslations("Common");
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [payload, setPayload] = useState<DevIpPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchHash = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/extension/dev-ip-hash", { cache: "no-store" });
      const data = (await res.json()) as Partial<DevIpPayload> & { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : "request_failed",
        );
      }
      if (!data.ip_hash || typeof data.ip_hash !== "string") {
        throw new Error("bad_response");
      }
      setPayload({
        ip_hash: data.ip_hash,
        window_start: typeof data.window_start === "string" ? data.window_start : undefined,
        utc_day_yyyymmdd: typeof data.utc_day_yyyymmdd === "string" ? data.utc_day_yyyymmdd : undefined,
      });
      setStatus("ready");
    } catch {
      setPayload(null);
      setStatus("error");
      setErrorMessage(t("devFetchError"));
    }
  }, [t]);

  useEffect(() => {
    if (!visible) return;
    void fetchHash();
  }, [visible, fetchHash]);

  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onDismiss]);

  const onCopyHash = async () => {
    const text = payload?.ip_hash ?? "";
    if (!text || status !== "ready") return;
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById("landing-dev-hash-copy-btn");
      if (btn instanceof HTMLButtonElement) {
        const prev = btn.textContent;
        btn.textContent = t("devCopied");
        setTimeout(() => {
          btn.textContent = prev;
        }, 1500);
      }
    } catch {
      try {
        const node = document.getElementById("landing-dev-ip-hash");
        const range = document.createRange();
        range.selectNodeContents(node!);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        /* noop */
      }
    }
  };

  if (!visible) return null;

  const metaParts: string[] = [];
  if (payload?.utc_day_yyyymmdd) metaParts.push(`${t("devUtcDay")}: ${payload.utc_day_yyyymmdd}`);
  if (payload?.window_start) metaParts.push(`${t("devWindowLabel")}: ${payload.window_start}`);

  const accountLine =
    authLoading ?
      `${t("devAccountLabel")}: …`
    : user?.id ?
      `${t("devAccountLabel")}: ${user.id} (${t("devGenBucketHint")})`
    : `${t("devGuestLabel")} (${t("devGenRequiresSignInHint")})`;

  return (
    <div className="border-b border-amber-400/20 bg-zinc-950/90 px-4 py-3 text-xs text-zinc-300 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300/95">
            {t("devSectionTitle")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-violet-500/35 bg-violet-600/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-600/25"
              onClick={() => void fetchHash()}
            >
              {t("devRefresh")}
            </button>
            <button
              type="button"
              aria-label={t("devDismissAria")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              onClick={onDismiss}
            >
              ×
            </button>
          </div>
        </div>
        <p className="leading-relaxed text-zinc-400">{t("devSectionHint")}</p>

        <p className="font-mono text-[11px] text-zinc-300">{accountLine}</p>

        <div className="flex flex-wrap items-stretch gap-2">
          <pre
            id="landing-dev-ip-hash"
            className="min-h-[2.75rem] flex-1 min-w-0 whitespace-pre-wrap break-all rounded-lg border border-zinc-700/80 bg-black/35 p-2 font-mono text-[11px] text-zinc-100 tabular-nums"
            tabIndex={0}
          >
            {status === "loading" || status === "idle" ?
              t("devLoading")
            : status === "error" ?
              ""
            : payload?.ip_hash}
          </pre>
          <button
            id="landing-dev-hash-copy-btn"
            type="button"
            disabled={status !== "ready" || !payload?.ip_hash}
            className="shrink-0 self-stretch rounded-lg border border-violet-500/35 bg-violet-600/15 px-3 py-1 text-[11px] font-semibold text-violet-200 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-violet-600/25"
            onClick={() => void onCopyHash()}
          >
            {t("devCopy")}
          </button>
        </div>

        {status === "error" ?
          <p className="text-[11px] text-red-300" role="alert">
            {errorMessage}
          </p>
        : metaParts.length > 0 ?
          <p className="font-mono text-[10px] text-zinc-500">{metaParts.join(" · ")}</p>
        : null}

        <p className="text-[10px] leading-relaxed text-zinc-600">{t("devExtensionBucketHint")}</p>
      </div>
    </div>
  );
}

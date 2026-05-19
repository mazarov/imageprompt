"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { STV_FOCUS_RING } from "./stv-marketing-shared";

const STORAGE_KEY = "extension_lite_pending";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const API_PATH = "/api/extension/analyze";

type AnalyzeStyle = "photoreal" | "midjourney" | "sd" | "flux";

type Panel = "empty" | "loading" | "result" | "error";

function looksLikeHttpImageUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Compact preview: fixed small frame; image scales inside with object-contain. */
function ImagePreviewFrame({
  src,
  variant = "default",
}: {
  src: string;
  variant?: "default" | "dimmed";
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[min(100%,18rem)] overflow-hidden rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.08] sm:max-w-[20rem] ${
        variant === "dimmed" ? "opacity-75" : ""
      }`}
    >
      <div className="flex h-44 w-full items-center justify-center p-2 sm:h-48 sm:p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}

async function resizeImageFileToDataUrl(file: Blob, maxPx = 1024, quality = 0.85): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width: srcW, height: srcH } = bitmap;
    const scale = Math.min(1, maxPx / Math.max(srcW, srcH));
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);
    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export function PromptSceneLiteWidget() {
  const t = useTranslations("PromptSceneLite");
  const [panel, setPanel] = useState<Panel>("empty");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [style, setStyle] = useState<AnalyzeStyle>("photoreal");
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ranPendingRef = useRef(false);

  const analyze = useCallback(
    async (dataUrl: string) => {
      setPanel("loading");
      setPreviewUrl(dataUrl);
      setErrorMessage("");

      let res: Response;
      try {
        res = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: dataUrl, style }),
          credentials: "omit",
        });
      } catch {
        setErrorMessage(t("errorConnection"));
        setPanel("error");
        return;
      }

      let data: { prompt?: string; error?: string; message?: string };
      try {
        data = await res.json();
      } catch {
        setErrorMessage(t("errorGeneric"));
        setPanel("error");
        return;
      }

      if (!res.ok) {
        if (data?.error === "rate_limited") {
          setErrorMessage(data?.message || t("errorRateLimited"));
        } else {
          setErrorMessage(data?.message || t("errorGeneric"));
        }
        setPanel("error");
        return;
      }

      if (!data?.prompt) {
        setErrorMessage(t("errorGeneric"));
        setPanel("error");
        return;
      }

      setPromptText(data.prompt);
      setPanel("result");
    },
    [style, t],
  );

  const analyzeFromImageUrl = useCallback(
    async (imageUrl: string) => {
      const trimmed = imageUrl.trim();
      if (!looksLikeHttpImageUrl(trimmed)) {
        setNotice(t("errorInvalidUrl"));
        return;
      }
      setNotice("");
      setPanel("loading");
      setPreviewUrl(trimmed);
      setErrorMessage("");

      let res: Response;
      try {
        res = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: trimmed, style }),
          credentials: "omit",
        });
      } catch {
        setErrorMessage(t("errorConnection"));
        setPanel("error");
        return;
      }

      let data: { prompt?: string; error?: string; message?: string };
      try {
        data = await res.json();
      } catch {
        setErrorMessage(t("errorGeneric"));
        setPanel("error");
        return;
      }

      if (!res.ok) {
        if (data?.error === "rate_limited") {
          setErrorMessage(data?.message || t("errorRateLimited"));
        } else {
          setErrorMessage(data?.message || t("errorGeneric"));
        }
        setPanel("error");
        return;
      }

      if (!data?.prompt) {
        setErrorMessage(t("errorGeneric"));
        setPanel("error");
        return;
      }

      setPromptText(data.prompt);
      setPanel("result");
    },
    [style, t],
  );

  const tryConsumePendingFromStorage = useCallback(async () => {
    if (ranPendingRef.current || typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    ranPendingRef.current = true;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }

    let parsed: { dataUrl?: string; error?: string };
    try {
      parsed = JSON.parse(raw) as { dataUrl?: string; error?: string };
    } catch {
      return;
    }

    if (parsed.error === "fetch_failed") {
      setNotice(t("noticeFetchFailed"));
      return;
    }
    if (parsed.dataUrl && typeof parsed.dataUrl === "string") {
      setPreviewUrl(parsed.dataUrl);
      await analyze(parsed.dataUrl);
    }
  }, [analyze, t]);

  // Extension content script may fill sessionStorage after first paint; poll briefly so
  // we do not miss a one-shot CustomEvent if it fired before this listener attached.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < 25 && !cancelled; i++) {
        await tryConsumePendingFromStorage();
        if (ranPendingRef.current) break;
        if (i < 24) await new Promise((r) => setTimeout(r, 120));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [tryConsumePendingFromStorage]);

  useEffect(() => {
    const onExtensionPending = () => {
      void tryConsumePendingFromStorage();
    };
    window.addEventListener("extension-lite-pending", onExtensionPending);
    return () => window.removeEventListener("extension-lite-pending", onExtensionPending);
  }, [tryConsumePendingFromStorage]);

  const handleFile = useCallback(async (file: File) => {
    setNotice("");
    if (!file.type.startsWith("image/")) {
      setNotice(t("invalidType"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setNotice(t("tooLarge"));
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await resizeImageFileToDataUrl(file);
    } catch {
      setNotice(t("readFailed"));
      return;
    }
    await analyze(dataUrl);
  }, [analyze, t]);

  useEffect(() => {
    if (panel !== "empty") return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (item) {
        const f = item.getAsFile();
        if (f) {
          void handleFile(f);
          return;
        }
      }
      const text = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (text && looksLikeHttpImageUrl(text)) {
        e.preventDefault();
        void analyzeFromImageUrl(text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [panel, handleFile, analyzeFromImageUrl]);

  const resetEmpty = () => {
    setPanel("empty");
    setPreviewUrl(null);
    setPromptText("");
    setErrorMessage("");
    setNotice("");
    setUrlInput("");
  };

  const copyPrompt = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-4 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-5">
      {notice ? <p className="mb-3 text-sm text-amber-400/90">{notice}</p> : null}

      {panel === "empty" ? (
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">{t("styleLabel")}</span>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as AnalyzeStyle)}
              className={`w-full rounded-lg border border-white/[0.1] bg-zinc-900 px-3 py-2 text-sm text-zinc-100 ${STV_FOCUS_RING}`}
            >
              <option value="photoreal">{t("stylePhotoreal")}</option>
              <option value="midjourney">{t("styleMidjourney")}</option>
              <option value="sd">{t("styleSd")}</option>
              <option value="flux">{t("styleFlux")}</option>
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">{t("urlLabel")}</span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  type="url"
                  name="image-url"
                  autoComplete="off"
                  placeholder={t("urlPlaceholder")}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void analyzeFromImageUrl(urlInput);
                    }
                  }}
                  className={`min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 ${STV_FOCUS_RING}`}
                />
                <button
                  type="button"
                  onClick={() => void analyzeFromImageUrl(urlInput)}
                  className={`shrink-0 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 ring-1 ring-white/10 transition hover:bg-zinc-700 ${STV_FOCUS_RING}`}
                >
                  {t("urlSubmit")}
                </button>
              </div>
            </label>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-8 text-center transition-colors hover:border-indigo-500/50 hover:bg-zinc-900/80 ${STV_FOCUS_RING}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-indigo-500/60");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("border-indigo-500/60");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-indigo-500/60");
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            <p className="text-sm font-medium text-zinc-200">{t("emptyTitle")}</p>
            <p className="mt-1 text-xs text-zinc-500">{t("emptyHint")}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className={`mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 ${STV_FOCUS_RING}`}
            >
              {t("chooseFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleFile(f);
              }}
            />
          </div>
          <p className="text-xs text-zinc-600">{t("pasteHint")}</p>
        </div>
      ) : null}

      {panel === "loading" && previewUrl ? (
        <div className="flex flex-col gap-4">
          <ImagePreviewFrame src={previewUrl} />
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-zinc-400">{t("analyzing")}</p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-500/80" />
            </div>
          </div>
        </div>
      ) : null}

      {panel === "result" && previewUrl ? (
        <div className="flex flex-col gap-4">
          <ImagePreviewFrame src={previewUrl} />
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{t("resultTitle")}</div>
            <pre className="max-h-[min(40vh,22rem)] overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.08] bg-zinc-900/80 p-3 text-xs leading-relaxed text-zinc-200 sm:text-sm">
              {promptText}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyPrompt()}
              className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${STV_FOCUS_RING}`}
            >
              {t("copy")}
            </button>
            <button
              type="button"
              onClick={resetEmpty}
              className={`rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 ${STV_FOCUS_RING}`}
            >
              {t("tryAgain")}
            </button>
          </div>
        </div>
      ) : null}

      {panel === "error" ? (
        <div className="flex flex-col gap-4">
          {previewUrl ? <ImagePreviewFrame src={previewUrl} variant="dimmed" /> : null}
          <p className="text-sm text-red-400">{errorMessage || t("errorGeneric")}</p>
          <button
            type="button"
            onClick={resetEmpty}
            className={`self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${STV_FOCUS_RING}`}
          >
            {t("tryAgain")}
          </button>
        </div>
      ) : null}

    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  appendLiteRecognitionHistory,
  EXTENSION_LITE_RECOGNITION_HISTORY_KEY,
  listLiteRecognitionHistory,
  type LiteRecognitionEntry,
} from "@/lib/extension-lite-recognition-history";
import {
  LANDING_BORDER_CARD,
  LANDING_BORDER_INPUT,
  LANDING_BORDER_SECTION_TOP,
  LANDING_RING_INSET_SOFT,
  LANDING_RING_NEUTRAL,
  LANDING_SURFACE_IMAGE_FRAME,
  LANDING_SURFACE_WIDGET_INSET,
  LANDING_SURFACE_WIDGET_INSET_SOLID,
  LANDING_SURFACE_WIDGET_NESTED,
  LANDING_SURFACE_WIDGET_OUTER,
  LANDING_SURFACE_WIDGET_TAB_ROW,
} from "@/lib/landing-design-tokens";
import { STV_FOCUS_RING } from "./stv-marketing-shared";

const HISTORY_HASH_PREFIX = "#extension-lite-history";

const STORAGE_KEY = "extension_lite_pending";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const API_PATH = "/api/extension/analyze";

type AnalyzeStyle = "photoreal" | "midjourney" | "sd" | "flux";

type Panel = "empty" | "loading" | "result" | "error";

type MainTab = "analyze" | "history";

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
      className={`mx-auto w-full max-w-[min(100%,18rem)] overflow-hidden rounded-xl ${LANDING_SURFACE_WIDGET_INSET} ${LANDING_RING_INSET_SOFT} sm:max-w-[20rem] ${
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
  const [mainTab, setMainTab] = useState<MainTab>("analyze");
  const [panel, setPanel] = useState<Panel>("empty");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [style, setStyle] = useState<AnalyzeStyle>("photoreal");
  const [urlInput, setUrlInput] = useState("");
  const [historyTick, setHistoryTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ranPendingRef = useRef(false);

  const bumpHistory = useCallback(() => setHistoryTick((n) => n + 1), []);

  const historyItems = useMemo(() => {
    void historyTick;
    return listLiteRecognitionHistory();
  }, [historyTick]);

  const showHistoryTab = historyItems.length >= 1;

  /** Deep link from extension popup (same hash as production home). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyHash = () => {
      if (
        window.location.hash === HISTORY_HASH_PREFIX &&
        showHistoryTab &&
        mainTab !== "history"
      ) {
        setMainTab("history");
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [showHistoryTab, mainTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onExt = () => bumpHistory();
    window.addEventListener("extension-lite-recognition-history", onExt);
    const onStorage = (e: StorageEvent) => {
      if (
        e.storageArea === window.localStorage &&
        e.key === EXTENSION_LITE_RECOGNITION_HISTORY_KEY
      ) {
        bumpHistory();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("extension-lite-recognition-history", onExt);
      window.removeEventListener("storage", onStorage);
    };
  }, [bumpHistory]);

  const analyzeDataUrlWithStyle = useCallback(
    async (dataUrl: string, styleUsed: AnalyzeStyle) => {
      setPanel("loading");
      setPreviewUrl(dataUrl);
      setErrorMessage("");

      let res: Response;
      try {
        res = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: dataUrl, style: styleUsed }),
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

      appendLiteRecognitionHistory({
        style: styleUsed,
        prompt: data.prompt,
        image: { mode: "data_url", dataUrl },
      });
      bumpHistory();

      setPromptText(data.prompt);
      setPanel("result");
    },
    [bumpHistory, t],
  );

  const analyzeImageUrlWithStyle = useCallback(
    async (imageUrl: string, styleUsed: AnalyzeStyle) => {
      const trimmed = imageUrl.trim();
      if (!looksLikeHttpImageUrl(trimmed)) {
        setNotice(t("errorInvalidUrl"));
        return;
      }
      setMainTab("analyze");
      setNotice("");
      setPanel("loading");
      setPreviewUrl(trimmed);
      setErrorMessage("");

      let res: Response;
      try {
        res = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: trimmed, style: styleUsed }),
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

      appendLiteRecognitionHistory({
        style: styleUsed,
        prompt: data.prompt,
        image: { mode: "image_url", imageUrl: trimmed },
      });
      bumpHistory();

      setPromptText(data.prompt);
      setPanel("result");
    },
    [bumpHistory, t],
  );

  const analyzeFromCurrentStyleDataUrl = useCallback(
    (dataUrl: string) => analyzeDataUrlWithStyle(dataUrl, style),
    [analyzeDataUrlWithStyle, style],
  );

  const analyzeFromCurrentStyleUrl = useCallback(
    (imageUrl: string) => analyzeImageUrlWithStyle(imageUrl, style),
    [analyzeImageUrlWithStyle, style],
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
      setMainTab("analyze");
      setPreviewUrl(parsed.dataUrl);
      await analyzeFromCurrentStyleDataUrl(parsed.dataUrl);
    }
  }, [analyzeFromCurrentStyleDataUrl, t]);

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
    setMainTab("analyze");
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
    await analyzeFromCurrentStyleDataUrl(dataUrl);
  }, [analyzeFromCurrentStyleDataUrl, t]);

  useEffect(() => {
    if (panel !== "empty" || mainTab !== "analyze") return;
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
        void analyzeFromCurrentStyleUrl(text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [panel, mainTab, handleFile, analyzeFromCurrentStyleUrl]);

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

  const copyHistoryPrompt = async (prompt: string) => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* ignore */
    }
  };

  const historyThumbnailSrc = (entry: LiteRecognitionEntry) =>
    entry.image.mode === "image_url" ? entry.image.imageUrl : entry.image.dataUrl;

  const recognizeAgainFromHistory = useCallback(
    (entry: LiteRecognitionEntry) => {
      setMainTab("analyze");
      if (entry.image.mode === "image_url") {
        void analyzeImageUrlWithStyle(entry.image.imageUrl, entry.style);
      } else {
        void analyzeDataUrlWithStyle(entry.image.dataUrl, entry.style);
      }
    },
    [analyzeDataUrlWithStyle, analyzeImageUrlWithStyle],
  );

  return (
    <div
      className={`w-full max-w-3xl rounded-2xl ${LANDING_BORDER_CARD} ${LANDING_SURFACE_WIDGET_OUTER} p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl shadow-black/30 backdrop-blur-sm sm:p-5`}
    >
      <div className={`mb-4 flex flex-wrap gap-1 rounded-lg ${LANDING_SURFACE_WIDGET_TAB_ROW} p-1 ${LANDING_RING_INSET_SOFT}`}>
        <button
          type="button"
          onClick={() => setMainTab("analyze")}
          className={`min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none ${STV_FOCUS_RING} ${
            mainTab === "analyze"
              ? "bg-indigo-600 text-white shadow"
              : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
          }`}
        >
          {t("tabAnalyze")}
        </button>
        {showHistoryTab ? (
          <button
            type="button"
            onClick={() => setMainTab("history")}
            className={`min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none ${STV_FOCUS_RING} ${
              mainTab === "history"
                ? "bg-indigo-600 text-white shadow"
                : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
            }`}
          >
            {t("tabHistory")}
          </button>
        ) : null}
      </div>

      {mainTab === "history" ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">{t("historyIntro")}</p>
          <ul className="max-h-[min(60vh,28rem)] list-none space-y-3 overflow-y-auto pr-0.5">
            {historyItems.map((entry) => (
              <li
                key={entry.id}
                className={`flex gap-3 rounded-xl ${LANDING_BORDER_CARD} ${LANDING_SURFACE_WIDGET_INSET} p-3 ${LANDING_RING_INSET_SOFT}`}
              >
                <div
                  className={`relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg ${LANDING_SURFACE_IMAGE_FRAME} ${LANDING_RING_INSET_SOFT}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={historyThumbnailSrc(entry)}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-medium uppercase tracking-wide text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    <span className="ml-2 normal-case text-zinc-600">{entry.style}</span>
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs leading-snug text-zinc-300">{entry.prompt}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => recognizeAgainFromHistory(entry)}
                      className={`inline-flex min-h-9 items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 ${STV_FOCUS_RING}`}
                    >
                      {t("historyRecognizeAgain")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyHistoryPrompt(entry.prompt)}
                      className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 ${LANDING_BORDER_INPUT} ${STV_FOCUS_RING}`}
                    >
                      {t("historyCopyPrompt")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {notice ? <p className="mb-3 text-sm text-amber-400/90">{notice}</p> : null}

          {panel === "empty" ? (
        <div className="flex flex-col gap-4">
          <div
            role="button"
            tabIndex={0}
            className={`flex min-h-[11rem] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-8 text-center transition-colors hover:border-indigo-500/50 hover:bg-zinc-900/80 sm:min-h-[10rem] ${STV_FOCUS_RING}`}
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
              className={`mt-4 inline-flex min-h-11 min-w-[10rem] items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 ${STV_FOCUS_RING}`}
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

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">{t("styleLabel")}</span>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as AnalyzeStyle)}
              className={`min-h-11 w-full rounded-lg px-3 py-2.5 text-sm text-zinc-100 ${LANDING_SURFACE_WIDGET_INSET_SOLID} ${LANDING_BORDER_INPUT} ${STV_FOCUS_RING}`}
            >
              <option value="photoreal">{t("stylePhotoreal")}</option>
              <option value="midjourney">{t("styleMidjourney")}</option>
              <option value="sd">{t("styleSd")}</option>
              <option value="flux">{t("styleFlux")}</option>
            </select>
          </label>

          <details className={`group rounded-xl ${LANDING_BORDER_CARD} ${LANDING_SURFACE_WIDGET_NESTED} sm:hidden`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-zinc-200 [&::-webkit-details-marker]:hidden">
              {t("urlSectionToggle")}
              <span className="shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180" aria-hidden>
                ▼
              </span>
            </summary>
            <div className={`${LANDING_BORDER_SECTION_TOP} p-3 pt-2`}>
              <div className="flex flex-col gap-2">
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
                      void analyzeFromCurrentStyleUrl(urlInput);
                    }
                  }}
                  className={`min-h-11 min-w-0 w-full rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 ${LANDING_SURFACE_WIDGET_INSET_SOLID} ${LANDING_BORDER_INPUT} ${STV_FOCUS_RING}`}
                />
                <button
                  type="button"
                  onClick={() => void analyzeFromCurrentStyleUrl(urlInput)}
                  className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 ${LANDING_RING_NEUTRAL} ${STV_FOCUS_RING}`}
                >
                  {t("urlSubmit")}
                </button>
              </div>
            </div>
          </details>

          <div className="hidden sm:block">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">{t("urlLabel")}</span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  type="url"
                  name="image-url-desktop"
                  autoComplete="off"
                  placeholder={t("urlPlaceholder")}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void analyzeFromCurrentStyleUrl(urlInput);
                    }
                  }}
                  className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 ${LANDING_SURFACE_WIDGET_INSET_SOLID} ${LANDING_BORDER_INPUT} ${STV_FOCUS_RING}`}
                />
                <button
                  type="button"
                  onClick={() => void analyzeFromCurrentStyleUrl(urlInput)}
                  className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 ${LANDING_RING_NEUTRAL} ${STV_FOCUS_RING}`}
                >
                  {t("urlSubmit")}
                </button>
              </div>
            </label>
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
        <div className="flex min-h-0 flex-col gap-4">
          <ImagePreviewFrame src={previewUrl} />
          <div className="min-h-0">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{t("resultTitle")}</div>
            <pre
              className={`max-h-[min(40vh,22rem)] min-h-0 overflow-auto whitespace-pre-wrap rounded-lg ${LANDING_BORDER_CARD} bg-zinc-900/80 p-3 text-xs leading-relaxed text-zinc-200 sm:text-sm`}
            >
              {promptText}
            </pre>
            <p className="mt-1.5 text-center text-[0.65rem] text-zinc-600 sm:hidden">{t("resultScrollHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyPrompt()}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 ${STV_FOCUS_RING}`}
            >
              {t("copy")}
            </button>
            <button
              type="button"
              onClick={resetEmpty}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 ${LANDING_BORDER_INPUT} ${STV_FOCUS_RING}`}
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
            className={`inline-flex min-h-11 items-center justify-center self-start rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 ${STV_FOCUS_RING}`}
          >
            {t("tryAgain")}
          </button>
        </div>
      ) : null}

        </>
      )}
    </div>
  );
}

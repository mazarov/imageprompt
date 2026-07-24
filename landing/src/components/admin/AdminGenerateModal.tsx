"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GenerationConfig = {
  models: { id: string; label: string; cost: number }[];
  aspectRatios: { value: string; label: string }[];
  imageSizes: { value: string; label: string }[];
  defaults: { model: string; aspectRatio: string; imageSize: string };
  limits: { minPromptLength: number };
};

type PollResult = {
  id: string;
  status: string;
  progress: number;
  resultUrl?: string;
  ugcCardId?: string | null;
  errorMessage?: string;
};

type AdminGenerateModalProps = {
  prompt: string;
  onClose: () => void;
};

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120_000;

export function AdminGenerateModal({ prompt: initialPrompt, onClose }: AdminGenerateModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [imageSize, setImageSize] = useState("1K");
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [results, setResults] = useState<PollResult[]>([]);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const loadPinnedPhoto = useCallback(async () => {
    setPhotoLoading(true);
    try {
      const res = await fetch("/api/admin/generation-photo", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load photo");
      setPhotoUrl(body.signedUrl ?? null);
    } catch (err) {
      setPhotoUrl(null);
      setGenerateError(err instanceof Error ? err.message : "Failed to load pinned photo");
    } finally {
      setPhotoLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/generation-config");
      const body = (await res.json()) as GenerationConfig & { error?: string };
      if (!res.ok) throw new Error(body.error || "Failed to load config");
      setConfig(body);
      setSelectedModel(body.defaults.model);
      setAspectRatio("9:16");
      setImageSize("1K");
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to load config");
    }
  }, []);

  useEffect(() => {
    void loadPinnedPhoto();
    void loadConfig();
  }, [loadPinnedPhoto, loadConfig]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generating) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [generating, onClose]);

  const onPhotoClick = () => {
    if (!photoUploading && !generating) fileInputRef.current?.click();
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file) return;
    setPhotoUploading(true);
    setGenerateError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/admin/generation-photo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || "Upload failed");
      setPhotoUrl(body.signedUrl ?? null);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoUploading(false);
    }
  };

  const pollOne = async (id: string): Promise<PollResult> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      const res = await fetch(`/api/admin/generations/${id}`, { credentials: "include" });
      const body = (await res.json()) as PollResult & { error?: string };
      if (!res.ok) throw new Error(body.error || "Poll failed");

      setResults((prev) => {
        const next = [...prev];
        const idx = next.findIndex((r) => r.id === id);
        const item = { ...body, id };
        if (idx >= 0) next[idx] = item;
        else next.push(item);
        return next;
      });

      if (body.status === "completed") return { ...body, id };
      if (body.status === "failed") {
        throw new Error(body.errorMessage || "Generation failed");
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Generation timeout");
  };

  const onGenerate = async () => {
    const minLen = config?.limits.minPromptLength ?? 8;
    if (prompt.trim().length < minLen) {
      setGenerateError(`Промпт должен быть минимум ${minLen} символов`);
      return;
    }
    if (!selectedModel) {
      setGenerateError("Выберите модель");
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    setResults([]);
    setProgressLabel("Запуск генерации…");

    try {
      const res = await fetch("/api/admin/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel,
          aspectRatio,
          imageSize,
          count,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || "Generation failed");
      }

      const ids = (body.ids ?? []) as string[];
      if (!ids.length) throw new Error("No generation ids returned");

      setResults(ids.map((id) => ({ id, status: "pending", progress: 10 })));
      setProgressLabel(`Генерация 0/${ids.length}…`);

      const completed: PollResult[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        setProgressLabel(`Генерация ${i + 1}/${ids.length}…`);
        const result = await pollOne(ids[i]);
        completed.push(result);
      }

      setResults(completed);
      setProgressLabel(null);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
      setProgressLabel(null);
    } finally {
      setGenerating(false);
    }
  };

  const selectedModelConfig = config?.models.find((m) => m.id === selectedModel);
  const canGenerate =
    !generating &&
    !photoLoading &&
    Boolean(selectedModel) &&
    prompt.trim().length >= (config?.limits.minPromptLength ?? 8);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-generate-title"
      onClick={() => {
        if (!generating) onClose();
      }}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="admin-generate-title" className="text-base font-semibold text-zinc-50">
            Генерация
          </h2>
          <button
            type="button"
            disabled={generating}
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onPhotoClick}
              disabled={photoUploading || generating}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#252525] transition hover:border-white/20 disabled:opacity-60"
              aria-label="Change reference photo"
            >
              {photoLoading ? (
                <span className="flex h-full items-center justify-center text-[10px] text-zinc-500">
                  …
                </span>
              ) : photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-2xl text-zinc-500">
                  +
                </span>
              )}
              {photoUploading ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] text-zinc-200">
                  …
                </span>
              ) : null}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void onPhotoSelected(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={generating}
              placeholder="Опишите изображение или референс, используя @..."
              className="min-h-[4.5rem] flex-1 resize-none rounded-xl border border-white/10 bg-[#252525] px-3 py-2 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/50 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div className="min-h-[12rem] rounded-xl border border-white/10 bg-[#141414] p-3">
            {results.some((r) => r.resultUrl) ? (
              <div className="grid grid-cols-2 gap-2">
                {results
                  .filter((r) => r.resultUrl)
                  .map((r) => (
                    <div key={r.id} className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.resultUrl}
                        alt=""
                        className="aspect-[9/16] w-full rounded-lg object-cover"
                      />
                      {r.ugcCardId ? (
                        <p className="text-[10px] text-emerald-400">
                          Черновик карточки: {r.ugcCardId.slice(0, 8)}…
                        </p>
                      ) : null}
                    </div>
                  ))}
              </div>
            ) : generating ? (
              <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-sm text-zinc-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
                <p>{progressLabel || "Генерация…"}</p>
              </div>
            ) : (
              <div className="flex h-full min-h-[12rem] items-center justify-center text-xs text-zinc-600">
                Результат появится здесь
              </div>
            )}
          </div>

          {configError ? (
            <p className="text-xs text-amber-400">{configError}</p>
          ) : null}
          {generateError ? <p className="text-xs text-red-400">{generateError}</p> : null}
        </div>

        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={generating || !config}
              className="rounded-full border border-white/10 bg-[#252525] px-3 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none disabled:opacity-60"
            >
              {(config?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={generating}
              className="rounded-full border border-white/10 bg-[#252525] px-3 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none disabled:opacity-60"
            >
              {(config?.aspectRatios ?? [{ value: "9:16", label: "9:16" }]).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.value}
                </option>
              ))}
            </select>
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              disabled={generating}
              className="rounded-full border border-white/10 bg-[#252525] px-3 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none disabled:opacity-60"
            >
              {(config?.imageSizes ?? [{ value: "1K", label: "1K" }]).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#252525] px-1 py-1">
              <button
                type="button"
                disabled={generating || count <= 1}
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-semibold text-zinc-100">
                {count}
              </span>
              <button
                type="button"
                disabled={generating || count >= 4}
                onClick={() => setCount((c) => Math.min(4, c + 1))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => void onGenerate()}
              className="flex flex-1 items-center justify-between rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{generating ? "Генерация…" : canGenerate ? "Сгенерировать" : "Введите промпт"}</span>
              {selectedModelConfig ? (
                <span className="rounded-full bg-emerald-800/80 px-2 py-0.5 text-xs">
                  {selectedModelConfig.cost} ✦
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

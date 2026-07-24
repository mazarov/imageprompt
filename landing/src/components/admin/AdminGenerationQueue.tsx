"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminPublicationStatusLabel,
  type AdminPublicationStatus,
} from "@/lib/admin-generation-queue";

type QueueItem = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  prompt: string;
  model: string | null;
  aspectRatio: string | null;
  imageSize: string | null;
  resultUrl: string | null;
  ugcCardId: string | null;
  publicationStatus: AdminPublicationStatus;
};

type AdminGenerationQueueProps = {
  onRegenerate: (prompt: string) => void;
  refreshKey?: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ status }: { status: AdminPublicationStatus }) {
  const styles: Record<AdminPublicationStatus, string> = {
    unpublished: "bg-amber-500/20 text-amber-200",
    card_pending: "bg-indigo-500/20 text-indigo-200",
    card_missing: "bg-red-500/20 text-red-200",
  };
  return (
    <span
      className={`inline-flex rounded-full px-1.5 py-px text-[10px] font-semibold ${styles[status]}`}
    >
      {adminPublicationStatusLabel(status)}
    </span>
  );
}

export function AdminGenerationQueue({ onRegenerate, refreshKey = 0 }: AdminGenerationQueueProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<{ id: string; prompt: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPage = useCallback(async (opts: { cursor?: string | null; append?: boolean }) => {
    const append = opts.append ?? false;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      params.set("status", "unpublished");
      if (opts.cursor) params.set("cursor", opts.cursor);
      params.set("limit", "30");

      const res = await fetch(`/api/admin/generations?${params.toString()}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (!append) {
          setItems([]);
          setNextCursor(null);
          setError(body?.message || body?.error || "Failed to load generation queue");
        }
        return;
      }

      const pageItems = (body.items ?? []) as QueueItem[];
      setItems((prev) => (append ? [...prev, ...pageItems] : pageItems));
      setNextCursor(body.nextCursor ?? null);
      if (!append) setError(null);
    } catch {
      if (!append) {
        setItems([]);
        setNextCursor(null);
        setError("Network error");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage({ append: false });
  }, [fetchPage, refreshKey]);

  const copyPrompt = async (id: string, prompt: string) => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-zinc-900/70 p-6 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-sm text-zinc-500">
        Нет неопубликованных генераций. Сгенерируйте изображение из вкладки «Анализы».
      </div>
    );
  }

  return (
    <>
      <ul className="list-none space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-2.5 rounded-xl border border-white/10 bg-zinc-900/60 p-2.5"
          >
            <button
              type="button"
              onClick={() => item.resultUrl && setLightboxUrl(item.resultUrl)}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="View full image"
            >
              {item.resultUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.resultUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[0.6rem] text-zinc-600">
                  No image
                </span>
              )}
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={item.publicationStatus} />
                <span className="text-[10px] text-zinc-500">
                  {formatDate(item.completedAt ?? item.createdAt)}
                </span>
                {item.model ? (
                  <span className="text-[10px] text-zinc-600">
                    {item.model}
                    {item.aspectRatio ? ` · ${item.aspectRatio}` : ""}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setPromptModal({ id: item.id, prompt: item.prompt })}
                className="line-clamp-2 text-left text-xs leading-snug text-zinc-300 hover:text-zinc-100"
              >
                {item.prompt}
              </button>
              <div className="mt-0.5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void copyPrompt(item.id, item.prompt)}
                  className="text-[11px] font-semibold text-indigo-400 transition hover:opacity-75"
                >
                  {copiedId === item.id ? "Copied" : "Copy prompt"}
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerate(item.prompt)}
                  className="text-[11px] font-semibold text-emerald-400 transition hover:opacity-75"
                >
                  Сгенерировать ещё
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {nextCursor ? (
        <div className="flex justify-center pb-4">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void fetchPage({ cursor: nextCursor, append: true })}
            className="rounded-full border border-white/10 bg-zinc-900 px-5 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/20 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightboxUrl(null);
          }}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/20 px-3 py-1 text-sm text-zinc-200"
            onClick={() => setLightboxUrl(null)}
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {promptModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="queue-prompt-modal-title"
          onClick={() => setPromptModal(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPromptModal(null);
          }}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full border border-white/20 px-3 py-1 text-sm text-zinc-200"
              onClick={() => setPromptModal(null)}
            >
              Close
            </button>
            <h2 id="queue-prompt-modal-title" className="pr-16 text-sm font-semibold text-zinc-400">
              Full prompt
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
              {promptModal.prompt}
            </p>
            <button
              type="button"
              onClick={() => void copyPrompt(promptModal.id, promptModal.prompt)}
              className="mt-4 text-[11px] font-semibold text-indigo-400 transition hover:opacity-75"
            >
              {copiedId === promptModal.id ? "Copied" : "Copy prompt"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminGenerateModal } from "@/components/admin/AdminGenerateModal";
import { AdminGenerationQueue } from "@/components/admin/AdminGenerationQueue";
import {
  CLIENT_SOURCES_ORDER,
  clientSourceColor,
  clientSourceLabel,
} from "@/components/admin/analytics-constants";

type ClientSourceFilter = "all" | (typeof CLIENT_SOURCES_ORDER)[number];
type AdminView = "analyses" | "unpublished" | "published";

type HistoryItem = {
  id: string;
  created_at: string;
  client_source: string;
  prompt: string;
  style: string | null;
  locale: string | null;
  model: string | null;
  image_url: string | null;
  is_published: boolean;
  card_url: string | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "short" });
}

function SourceBadge({ source }: { source: string }) {
  const color = clientSourceColor(source);
  return (
    <span
      className="inline-flex rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-zinc-950"
      style={{ backgroundColor: color }}
    >
      {clientSourceLabel(source)}
    </span>
  );
}

export function AnalyzeHistoryList() {
  const [view, setView] = useState<AdminView>("analyses");
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [clientSourceFilter, setClientSourceFilter] = useState<ClientSourceFilter>("all");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<{ id: string; prompt: string } | null>(null);
  const [generateModal, setGenerateModal] = useState<{ id: string; prompt: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishErrorById, setPublishErrorById] = useState<Record<string, string>>({});

  const fetchPage = useCallback(
    async (opts: { cursor?: string | null; append?: boolean; source?: ClientSourceFilter }) => {
      const append = opts.append ?? false;
      const source = opts.source ?? clientSourceFilter;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams();
        if (source !== "all") params.set("client_source", source);
        if (opts.cursor) params.set("cursor", opts.cursor);
        params.set("limit", "30");

        const res = await fetch(`/api/admin/analyze-history?${params.toString()}`, {
          credentials: "include",
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!append) {
            setItems([]);
            setNextCursor(null);
            setError({
              status: res.status,
              message:
                body?.message ||
                body?.error ||
                (res.status === 401
                  ? "Sign in required"
                  : res.status === 403
                    ? "Access denied"
                    : "Failed to load analyze history"),
            });
          }
          return;
        }

        const pageItems = (body.items ?? []) as HistoryItem[];
        setItems((prev) => (append ? [...prev, ...pageItems] : pageItems));
        setNextCursor(body.next_cursor ?? null);
        if (!append) setError(null);
      } catch {
        if (!append) {
          setItems([]);
          setNextCursor(null);
          setError({ status: 0, message: "Network error" });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [clientSourceFilter],
  );

  useEffect(() => {
    void fetchPage({ append: false });
  }, [fetchPage]);

  const onFilterChange = (source: ClientSourceFilter) => {
    setClientSourceFilter(source);
    void fetchPage({ append: false, source, cursor: null });
  };

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

  const publishItem = async (id: string) => {
    if (publishingId) return;
    setPublishingId(id);
    setPublishErrorById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const res = await fetch(
        `/api/admin/analyze-history/${encodeURIComponent(id)}/publish`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          typeof body?.message === "string" && body.message
            ? body.message
            : typeof body?.code === "string" && body.code
              ? body.code
              : null;
        setPublishErrorById((prev) => ({
          ...prev,
          [id]: detail
            ? `${body?.error || "Не удалось опубликовать"}: ${detail}`
            : body?.error || "Не удалось опубликовать",
        }));
        return;
      }

      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                is_published: true,
                card_url: (body.cardUrl as string | null) ?? item.card_url,
              }
            : item,
        ),
      );
    } catch {
      setPublishErrorById((prev) => ({ ...prev, [id]: "Network error" }));
    } finally {
      setPublishingId(null);
    }
  };

  if (error?.status === 401) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-zinc-900/70 p-8 text-center">
        <h1 className="text-xl font-semibold text-zinc-50">Analyze history</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Sign in with an allowed Google account to view analyze history.
        </p>
        <a
          href={`/api/auth/google?next=${encodeURIComponent("/admin/analyze-history")}`}
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in with Google
        </a>
      </div>
    );
  }

  if (error?.status === 403) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-8 text-center">
        <h1 className="text-xl font-semibold text-zinc-50">Access denied</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Your account is not in <code className="text-amber-200">ANALYTICS_ADMIN_EMAILS</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Analyze history</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Photos and prompts from site, PromptShot, and Extension Lite
          </p>
        </div>
        <Link
          href="/admin/analytics"
          className="text-sm font-medium text-indigo-400 transition hover:text-indigo-300"
        >
          ← Analytics
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterTab
          active={view === "analyses"}
          onClick={() => setView("analyses")}
          label="Анализы"
        />
        <FilterTab
          active={view === "unpublished"}
          onClick={() => setView("unpublished")}
          label="Сгенерировано, не опубликовано"
        />
        <FilterTab
          active={view === "published"}
          onClick={() => setView("published")}
          label="Опубликовано"
        />
      </div>

      {view === "unpublished" || view === "published" ? (
        <AdminGenerationQueue
          status={view}
          refreshKey={queueRefreshKey}
          onRegenerate={(prompt) => setGenerateModal({ id: "queue", prompt })}
        />
      ) : null}

      {view === "analyses" ? (
        <>
      <div className="flex flex-wrap gap-2">
        <FilterTab
          active={clientSourceFilter === "all"}
          onClick={() => onFilterChange("all")}
          label="All"
        />
        {CLIENT_SOURCES_ORDER.map((src) => (
          <FilterTab
            key={src}
            active={clientSourceFilter === src}
            onClick={() => onFilterChange(src)}
            label={clientSourceLabel(src)}
          />
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-zinc-900/70 p-6 text-sm text-red-200">
          {error.message}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-sm text-zinc-500">
          No analyze history yet. Run an analyze request from the site or extension.
        </div>
      ) : (
        <ul className="list-none space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-2.5 rounded-xl border border-white/10 bg-zinc-900/60 p-2.5"
            >
              <button
                type="button"
                onClick={() => item.image_url && setLightboxUrl(item.image_url)}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="View full image"
              >
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-[0.6rem] text-zinc-600">
                    No image
                  </span>
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SourceBadge source={item.client_source} />
                  <span className="text-[10px] text-zinc-500">{formatDate(item.created_at)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPromptModal({ id: item.id, prompt: item.prompt })}
                  className="line-clamp-1 text-left text-xs leading-snug text-zinc-300 hover:text-zinc-100"
                >
                  {item.prompt}
                </button>
                {publishErrorById[item.id] ? (
                  <p className="text-[11px] text-red-300">{publishErrorById[item.id]}</p>
                ) : null}
                <div className="mt-0.5 flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => void copyPrompt(item.id, item.prompt)}
                    className="text-[11px] font-semibold text-indigo-400 transition hover:opacity-75"
                  >
                    {copiedId === item.id ? "Copied" : "Copy prompt"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenerateModal({ id: item.id, prompt: item.prompt })}
                    className="text-[11px] font-semibold text-emerald-400 transition hover:opacity-75"
                  >
                    Сгенерировать
                  </button>
                  {!item.is_published ? (
                    <button
                      type="button"
                      disabled={publishingId !== null || !item.image_url}
                      onClick={() => void publishItem(item.id)}
                      className="text-[11px] font-semibold text-amber-300 transition hover:opacity-75 disabled:opacity-50"
                    >
                      {publishingId === item.id ? "Публикация…" : "Опубликовать"}
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-300">
                      Опубликовано
                    </span>
                  )}
                  {item.card_url ? (
                    <a
                      href={item.card_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-sky-300 transition hover:opacity-75"
                    >
                      Открыть на сайте
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && !loading ? (
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
        </>
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

      {generateModal ? (
        <AdminGenerateModal
          prompt={generateModal.prompt}
          onClose={() => setGenerateModal(null)}
          onCompleted={() => setQueueRefreshKey((k) => k + 1)}
        />
      ) : null}

      {promptModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-modal-title"
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
            <h2 id="prompt-modal-title" className="pr-16 text-sm font-semibold text-zinc-400">
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
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

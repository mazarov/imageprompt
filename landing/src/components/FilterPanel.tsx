"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getTagsByDimension, findTagBySlug, type Dimension } from "@/lib/tag-registry";
import { FilterChips } from "./FilterChips";
import type { FilterState } from "@/hooks/useListingFilters";
import type { PromptCardFull } from "@/lib/supabase";

const DIMENSION_ORDER: (keyof FilterState)[] = ["audience", "style", "occasion", "object"];
const DIM_TO_DIMENSION: Record<keyof FilterState, Dimension> = {
  audience: "audience_tag",
  style: "style_tag",
  occasion: "occasion_tag",
  object: "object_tag",
};

type FilterCountRow = { dimension: string; slug: string; cards_count: number };

type Props = {
  filters: FilterState;
  onApply: (nextFilters: FilterState) => void;
  onClose: () => void;
  hiddenDimensions: Dimension[];
  /** Catalog: fetch counts from API */
  rpcParams?: Record<string, string | null>;
  /** Search: compute counts from loaded cards */
  cardsForCounts?: PromptCardFull[];
};

function aggregateCountsFromCards(cards: PromptCardFull[]): FilterCountRow[] {
  const byDim: Record<string, Record<string, number>> = {};
  const dims = ["audience_tag", "style_tag", "occasion_tag", "object_tag"] as const;
  for (const card of cards) {
    const tags = (card.seo_tags || {}) as Record<string, string[]>;
    for (const dim of dims) {
      const arr = tags[dim] || [];
      for (const slug of arr) {
        if (!slug || slug === "") continue;
        if (!byDim[dim]) byDim[dim] = {};
        byDim[dim][slug] = (byDim[dim][slug] || 0) + 1;
      }
    }
  }
  const result: FilterCountRow[] = [];
  for (const [dim, slugs] of Object.entries(byDim)) {
    for (const [slug, count] of Object.entries(slugs)) {
      if (count > 0) result.push({ dimension: dim, slug, cards_count: count });
    }
  }
  return result;
}

export function FilterPanel({
  filters,
  onApply,
  onClose,
  hiddenDimensions,
  rpcParams,
  cardsForCounts,
}: Props) {
  const locale = useLocale();
  const tFilters = useTranslations("Filters");
  const tDim = useTranslations("Dimensions");
  const tCommon = useTranslations("Common");
  const [draft, setDraft] = useState<FilterState>(filters);
  const [objectSearch, setObjectSearch] = useState("");
  const [apiCounts, setApiCounts] = useState<FilterCountRow[]>([]);

  const countsFromCards = useMemo(
    () => (cardsForCounts?.length ? aggregateCountsFromCards(cardsForCounts) : []),
    [cardsForCounts]
  );

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const fetchCounts = useCallback(async () => {
    if (!rpcParams) return;
    try {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(rpcParams)) {
        if (v) sp.set(k, v);
      }
      sp.set("site_lang", locale === "en" ? "en" : "ru");
      const res = await fetch(`/api/filter-counts?${sp.toString()}`);
      const data = (await res.json()) as FilterCountRow[];
      setApiCounts(data);
    } catch {
      setApiCounts([]);
    }
  }, [rpcParams, locale]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const counts = rpcParams ? apiCounts : countsFromCards;

  const dimsToShow = DIMENSION_ORDER.filter(
    (k) => !hiddenDimensions.includes(DIM_TO_DIMENSION[k])
  );

  const getTagsWithCounts = useCallback(
    (dim: Dimension) => {
      const allTags = getTagsByDimension(dim);
      const hasCounts = rpcParams || cardsForCounts?.length;
      if (!hasCounts || counts.length === 0) {
        return { tags: allTags, countBySlug: {} as Record<string, number> };
      }
      const dimCounts = counts.filter((r) => r.dimension === dim);
      const countBySlug: Record<string, number> = {};
      for (const r of dimCounts) {
        countBySlug[r.slug] = r.cards_count;
      }
      const applicable = allTags
        .filter((t) => (countBySlug[t.slug] ?? 0) > 0)
        .sort((a, b) => (countBySlug[b.slug] ?? 0) - (countBySlug[a.slug] ?? 0));
      return { tags: applicable, countBySlug };
    },
    [rpcParams, cardsForCounts, counts]
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md max-h-[70vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-zinc-900 shadow-2xl shadow-black/50 animate-scale-in origin-bottom-right sm:bottom-6 sm:right-6"
        role="dialog"
        aria-label={tFilters("ariaPanel")}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.08] bg-zinc-900 px-4 py-3">
          <h2 className="text-base font-semibold text-zinc-50">{tFilters("panelTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label={tCommon("close")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-4">
          {dimsToShow.map((key) => {
            const dim = DIM_TO_DIMENSION[key];
            const label = tDim(dim);
            const { tags, countBySlug } = getTagsWithCounts(dim);
            const selectedSlug = draft[key];
            const selectedTag = selectedSlug ? findTagBySlug(dim, selectedSlug) : null;
            const tagsToShow =
              selectedSlug && selectedTag && !tags.some((t) => t.slug === selectedSlug)
                ? [selectedTag, ...tags]
                : tags;

            return (
              <div key={key}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  {label}
                </p>
                <FilterChips
                  tags={tagsToShow}
                  selectedSlug={selectedSlug}
                  onSelect={(slug) => setDraft((p) => ({ ...p, [key]: slug }))}
                  searchQuery={key === "object" ? objectSearch : undefined}
                  onSearchChange={key === "object" ? setObjectSearch : undefined}
                  searchPlaceholder={tFilters("findScene")}
                  countBySlug={Object.keys(countBySlug).length > 0 ? countBySlug : undefined}
                />
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-white/[0.08] bg-zinc-900 p-4">
          <button
            type="button"
            onClick={() => {
              onApply({ audience: null, style: null, occasion: null, object: null });
              onClose();
            }}
            className="flex-1 rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            {tFilters("reset")}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {tFilters("apply")}
          </button>
        </div>
      </div>
    </>
  );
}

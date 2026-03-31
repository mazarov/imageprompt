"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { FilterPanel } from "./FilterPanel";
import type { FilterState } from "@/hooks/useListingFilters";
import type { Dimension } from "@/lib/tag-registry";
import type { PromptCardFull } from "@/lib/supabase";

type Props = {
  filters: FilterState;
  activeCount: number;
  onApply: (nextFilters: FilterState) => void;
  hiddenDimensions: Dimension[];
  /** Catalog: fetch counts from API */
  rpcParams?: Record<string, string | null>;
  /** Search: compute counts from loaded cards */
  cardsForCounts?: PromptCardFull[];
};

export function FilterFAB({
  filters,
  activeCount,
  onApply,
  hiddenDimensions,
  rpcParams,
  cardsForCounts,
}: Props) {
  const t = useTranslations("Filters");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {mounted &&
        createPortal(
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="fixed bottom-20 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 transition-all hover:bg-indigo-500 active:scale-95 sm:bottom-6 sm:right-6"
            aria-label={
              activeCount > 0 ? t("withCount", { count: activeCount }) : t("ariaPanel")
            }
          >
            {activeCount > 0 ? (
              <span className="text-sm font-semibold tabular-nums">{activeCount}</span>
            ) : (
              <FilterIcon />
            )}
          </button>,
          document.body,
        )}

      {open && (
        <FilterPanel
          filters={filters}
          onApply={onApply}
          onClose={() => setOpen(false)}
          hiddenDimensions={hiddenDimensions}
          rpcParams={rpcParams}
          cardsForCounts={cardsForCounts}
        />
      )}
    </>
  );
}

function FilterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

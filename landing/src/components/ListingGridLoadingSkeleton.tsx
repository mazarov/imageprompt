"use client";

import { useTranslations } from "next-intl";
import { ListingCardChromeSkeleton, ListingCardPhotoSkeleton } from "./ListingCardPhotoSkeleton";

const GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

type Props = {
  count?: number;
};

/**
 * Placeholders while fetching the next listing page — same outer shape as PromptCard / GroupedCard.
 */
export function ListingGridLoadingSkeleton({ count = 8 }: Props) {
  const t = useTranslations("ListingGrid");
  return (
    <div className={`${GRID} py-6`} aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("loadingMore")}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="min-w-0">
          <article className="relative isolate overflow-hidden rounded-2xl bg-transparent shadow-md shadow-black/30 ring-1 ring-white/[0.08]">
            <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-800/90 aspect-[3/4] ring-1 ring-white/[0.06]">
              <ListingCardPhotoSkeleton />
              <ListingCardChromeSkeleton />
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}

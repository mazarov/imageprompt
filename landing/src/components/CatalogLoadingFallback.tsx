"use client";

import { useTranslations } from "next-intl";

export function CatalogLoadingFallback() {
  const t = useTranslations("Catalog");
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pb-8"
      aria-busy="true"
      aria-label={t("loadingAria")}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="aspect-[3/4] rounded-2xl bg-zinc-800 animate-pulse"
        />
      ))}
    </div>
  );
}

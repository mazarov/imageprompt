"use client";

import { useTranslations } from "next-intl";

export function CardLoadingFallback() {
  const t = useTranslations("CardSeo");
  return (
    <div
      className="mx-auto max-w-2xl space-y-6 px-5 py-10"
      aria-busy="true"
      aria-label={t("loadingAria")}
    >
      <div className="h-64 animate-pulse rounded-3xl bg-zinc-800" />
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded-lg bg-zinc-800" />
      <div className="h-36 animate-pulse rounded-2xl bg-zinc-900/60" />
    </div>
  );
}

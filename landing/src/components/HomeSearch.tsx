"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

const SUGGESTIONS_RU = [
  "портрет",
  "чёрно-белое",
  "GTA",
  "на море",
  "аниме",
  "с котом",
  "3D",
];
const SUGGESTIONS_EN = [
  "portrait",
  "black and white",
  "GTA",
  "at the sea",
  "anime",
  "with cat",
  "3D",
];

export function HomeSearch() {
  const locale = useLocale();
  const t = useTranslations("HomeSearch");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => (locale === "ru" ? SUGGESTIONS_RU : SUGGESTIONS_EN), [locale]);

  const navigate = useCallback(
    (q: string) => {
      if (q.length >= 2) router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [router],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate(query.trim());
    },
    [query, navigate],
  );

  return (
    <div className="mx-auto w-full max-w-xl">
      <form onSubmit={handleSubmit}>
        <div className="group relative">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("placeholder")}
            enterKeyHint="search"
            className="w-full rounded-2xl border border-white/[0.1] bg-zinc-950/60 py-3.5 pl-12 pr-4 text-[16px] text-zinc-100 shadow-sm shadow-black/20 ring-1 ring-transparent placeholder:text-zinc-500 transition-all duration-200 focus:border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 sm:py-3.5 sm:text-[15px]"
          />
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <span className="mr-0.5 text-[11px] text-zinc-500">{t("popular")}</span>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => navigate(s)}
            className="rounded-full border border-white/[0.08] bg-zinc-900/60 px-3 py-1 text-[12px] font-medium text-zinc-400 transition-all hover:border-indigo-500/30 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import type { TagEntry } from "@/lib/tag-registry";
import { tagDisplayLabel } from "@/lib/tag-label";

type Props = {
  tags: TagEntry[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  /** When provided, shows count next to label e.g. "Портрет (42)" */
  countBySlug?: Record<string, number>;
};

export function FilterChips({
  tags,
  selectedSlug,
  onSelect,
  searchQuery = "",
  onSearchChange,
  searchPlaceholder,
  countBySlug,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("Filters");
  const q = searchQuery.trim().toLowerCase();
  const filtered = searchQuery.trim()
    ? tags.filter((tag) => {
        const main = tagDisplayLabel(tag, locale).toLowerCase();
        return (
          main.includes(q) ||
          tag.labelRu.toLowerCase().includes(q) ||
          tag.labelEn.toLowerCase().includes(q) ||
          tag.slug.toLowerCase().includes(q)
        );
      })
    : tags;

  const displayTags = filtered.slice(0, 50);

  return (
    <div className="space-y-2">
      {tags.length > 20 && onSearchChange && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder ?? t("findPlaceholder")}
          className="w-full rounded-lg border border-white/[0.1] bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
          readOnly
        />
      )}
      <div className="flex flex-wrap gap-1.5 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            !selectedSlug
              ? "bg-indigo-600 text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {t("all")}
        </button>
        {displayTags.map((tag) => {
          const count = countBySlug?.[tag.slug];
          const base = tagDisplayLabel(tag, locale);
          const label = count != null ? `${base} (${count})` : base;
          return (
            <button
              key={tag.slug}
              type="button"
              onClick={() => onSelect(selectedSlug === tag.slug ? null : tag.slug)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors whitespace-nowrap ${
                selectedSlug === tag.slug
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

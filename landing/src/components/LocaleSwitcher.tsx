"use client";

import { useLocale } from "next-intl";
import { useState, useMemo, useRef, useEffect } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const POPULAR = new Set([
  "en",
  "ru",
  "es",
  "fr",
  "de",
  "zh-CN",
  "ja",
  "ar",
  "hi",
  "pt-BR",
  "ko",
  "it",
  "nl",
  "pl",
  "tr",
  "vi",
]);

const LABELS: Record<string, string> = {
  en: "English",
  ru: "Русский",
  es: "Español",
  "es-419": "Español (LatAm)",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  hi: "हिन्दी",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  "pt-BR": "Português (BR)",
  "pt-PT": "Português (PT)",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Bahasa Indonesia",
  he: "עברית",
  fa: "فارسی",
  uk: "Українська",
  sv: "Svenska",
  cs: "Čeština",
  hu: "Magyar",
  ro: "Română",
  el: "Ελληνικά",
  da: "Dansk",
  fi: "Suomi",
  no: "Norsk",
  sk: "Slovenčina",
  bg: "Български",
  sr: "Српски",
  hr: "Hrvatski",
  sl: "Slovenščina",
  ca: "Català",
  fil: "Filipino",
  sw: "Kiswahili",
  ms: "Bahasa Melayu",
  ta: "தமிழ்",
  te: "తెలుగు",
  kn: "ಕನ್ನಡ",
  mr: "मराठी",
  gu: "ગુજરાતી",
  bn: "বাংলা",
  am: "አማርኛ",
  et: "Eesti",
  lv: "Latviešu",
  lt: "Lietuvių",
};

export function LocaleSwitcher() {
  const current = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const allLocales: string[] = [...routing.locales];

  // Guard against bad hook values during hydration (especially with 52 locales).
  // A crash here takes down the footer and breaks client navigation on the whole page.
  if (typeof current !== "string" || !current) {
    // Render a minimal safe placeholder so the footer doesn't die.
    return (
      <div className="relative text-[11px] font-semibold">
        <span className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-white/[0.08] bg-zinc-950/60 px-2.5 py-1 text-zinc-500">
          —
        </span>
      </div>
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allLocales;
    if (q) {
      list = allLocales.filter((l) => {
        const label = (LABELS[l] || l).toLowerCase();
        return l.toLowerCase().includes(q) || label.includes(q);
      });
    }
    // popular first, then alpha by label/code
    return [...list].sort((a, b) => {
      const ap = POPULAR.has(a) ? 0 : 1;
      const bp = POPULAR.has(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const la = (LABELS[a] || a).toLowerCase();
      const lb = (LABELS[b] || b).toLowerCase();
      return la.localeCompare(lb);
    });
  }, [query, allLocales]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onEsc);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative text-[11px] font-semibold">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setQuery("");
        }}
        className="flex min-h-11 items-center gap-1 rounded-lg border border-white/[0.08] bg-zinc-950/60 px-2.5 py-1 text-zinc-200 transition hover:bg-zinc-900/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.toUpperCase()}</span>
        <span className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full z-50 mb-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search language or code…"
              className="min-h-11 w-full rounded-md border border-white/10 bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/40 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-[min(18rem,50vh)] overflow-auto py-1 text-sm">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">No matches</div>
            )}
            {filtered.map((loc) => {
              const label = LABELS[loc] || loc;
              const isActive = loc === current;
              return (
                <Link
                  key={loc}
                  href={pathname}
                  locale={loc}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 w-full items-center justify-between px-3 py-1.5 text-left transition ${
                    isActive
                      ? "bg-indigo-500/15 text-indigo-200"
                      : "text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{loc}</span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-zinc-500">
            {filtered.length} / {allLocales.length} languages
          </div>
        </div>
      )}
    </div>
  );
}

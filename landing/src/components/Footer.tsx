"use client";

import { useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SiteLogoMark } from "./SiteLogoMark";
import { useDebug } from "./DebugFAB";

export function Footer() {
  const t = useTranslations("Footer");
  const tc = useTranslations("Common");
  const debug = useDebug();
  const clickCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      clickCount.current += 1;
      if (timer.current) clearTimeout(timer.current);
      if (clickCount.current >= 5) {
        clickCount.current = 0;
        debug?.toggleDebug();
      } else {
        timer.current = setTimeout(() => {
          clickCount.current = 0;
        }, 1500);
      }
    },
    [debug],
  );

  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-[rgb(9_9_11/0.5)]">
      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex items-center gap-2 text-base font-bold tracking-tight text-zinc-50 select-none"
            >
              <SiteLogoMark
                size={24}
                className={`h-6 w-6 rounded-md ${debug?.debugOpen ? "ring-2 ring-amber-400/70" : ""}`}
              />
              {tc("brandWordmark")}
            </button>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">{t("tagline")}</p>
          </div>
          <nav className="flex gap-12">
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{t("navTitle")}</div>
              <ul className="space-y-2">
                <li>
                  <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
                    {tc("home")}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} {tc("brandWordmark")}. {t("copyright")}
          </p>
          <Link href="/privacy" className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            {t("privacyLink")}
          </Link>
        </div>
      </div>
    </footer>
  );
}

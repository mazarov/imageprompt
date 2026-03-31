"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { HOME_ANCHOR_IDS, HOME_ANCHOR_NAV } from "@/lib/home-anchor-nav";

/** Align with section `scroll-mt-[5.5rem]` (~88px) — active = last section whose top crossed this line */
const ACTIVATION_OFFSET_PX = 88;

function computeActiveSectionId(ids: readonly string[]): string {
  const fallback = ids[0] ?? "";
  let active = fallback;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top <= ACTIVATION_OFFSET_PX) active = id;
  }
  return active;
}

function useHomeScrollSpy(sectionIds: readonly string[]) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] ?? "");
  const rafRef = useRef<number | null>(null);
  const lastAppliedRef = useRef<string>("");

  const syncFromScroll = useCallback(() => {
    const next = computeActiveSectionId(sectionIds);
    if (next !== lastAppliedRef.current) {
      lastAppliedRef.current = next;
      setActiveId(next);
    }
  }, [sectionIds]);

  const scheduleSync = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncFromScroll();
    });
  }, [syncFromScroll]);

  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && sectionIds.includes(h)) {
        lastAppliedRef.current = h;
        setActiveId(h);
        return;
      }
      scheduleSync();
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [sectionIds, scheduleSync]);

  useEffect(() => {
    syncFromScroll();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });
    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleSync, syncFromScroll]);

  const setActiveFromNav = useCallback((id: string) => {
    lastAppliedRef.current = id;
    setActiveId(id);
  }, []);

  return { activeId, setActiveFromNav };
}

function AnchorNavList({
  activeId,
  onNavigate,
  className = "",
}: {
  activeId: string;
  onNavigate: (id: string) => void;
  className?: string;
}) {
  const t = useTranslations("HomeNav");
  return (
    <nav className={`flex flex-col gap-0.5 px-3 py-4 ${className}`} aria-label={t("onThisPage")}>
      {HOME_ANCHOR_NAV.map((item) => {
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors duration-200 ease-out ${
              active
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
            }`}
          >
            {t(item.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}

export function HomeAnchorSidebar() {
  const t = useTranslations("HomeNav");
  const { activeId, setActiveFromNav } = useHomeScrollSpy(HOME_ANCHOR_IDS);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToId = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      setActiveFromNav(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${id}`);
      }
      setMobileOpen(false);
    },
    [setActiveFromNav]
  );

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  return (
    <>
      <aside className="hidden w-60 flex-shrink-0 lg:block">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-white/[0.08] bg-[#09090b]">
          <AnchorNavList activeId={activeId} onNavigate={scrollToId} />
        </div>
      </aside>

      {mounted &&
        createPortal(
          <>
            {!mobileOpen && (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="fixed bottom-20 left-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 transition-all hover:bg-indigo-500 active:scale-95 sm:bottom-6 sm:left-6 lg:hidden"
                aria-label={t("onThisPage")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </button>
            )}

            {mobileOpen && (
              <div className="fixed inset-0 z-50 flex lg:hidden">
                <div
                  className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
                  onClick={() => setMobileOpen(false)}
                />
                <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-white/[0.08] bg-[#09090b] shadow-2xl shadow-black/50">
                  <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                    <span className="text-sm font-semibold text-zinc-50">{t("sections")}</span>
                    <button
                      type="button"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    <AnchorNavList activeId={activeId} onNavigate={scrollToId} />
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body
        )}
    </>
  );
}

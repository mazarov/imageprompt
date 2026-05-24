"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { LANDING_HEADER_BACKDROP } from "@/lib/landing-design-tokens";
import { LandingDeveloperDiagnostics } from "@/components/LandingDeveloperDiagnostics";
import { SiteLogoMark } from "./SiteLogoMark";

const BRAND_UNLOCK_TAPS = 5;
const BRAND_TAP_WINDOW_MS = 2000;
const BRAND_NAV_DELAY_MS = 220;

export function HeaderClient() {
  const t = useTranslations("Common");
  const router = useRouter();

  const [devOpen, setDevOpen] = useState(false);
  const tapsRef = useRef(0);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onBrandNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

    e.preventDefault();

    const r = tapsRef;
    if (tapResetRef.current) {
      clearTimeout(tapResetRef.current);
      tapResetRef.current = null;
    }
    r.current += 1;

    tapResetRef.current = setTimeout(() => {
      r.current = 0;
      tapResetRef.current = null;
    }, BRAND_TAP_WINDOW_MS);

    if (navDelayRef.current) {
      clearTimeout(navDelayRef.current);
      navDelayRef.current = null;
    }

    if (r.current >= BRAND_UNLOCK_TAPS) {
      r.current = 0;
      if (tapResetRef.current) {
        clearTimeout(tapResetRef.current);
        tapResetRef.current = null;
      }
      setDevOpen(true);
      return;
    }

    navDelayRef.current = setTimeout(() => {
      navDelayRef.current = null;
      r.current = 0;
      router.push("/");
    }, BRAND_NAV_DELAY_MS);
  };

  return (
    <header className={`sticky top-0 z-40 ${LANDING_HEADER_BACKDROP}`}>
      <div className="relative flex h-14 items-center justify-center px-4 lg:justify-between lg:px-5">
        <Link
          href="/"
          onClick={onBrandNavClick}
          title={t("brandWordmark")}
          className="-mx-2 flex items-center gap-2 rounded-xl px-2 py-1 text-lg font-bold tracking-tight text-zinc-50 transition hover:bg-zinc-900/55 lg:flex-shrink-0 select-none"
        >
          <SiteLogoMark size={28} className="h-7 w-7 rounded-lg" />
          <span>{t("brandWordmark")}</span>
        </Link>
      </div>
      <LandingDeveloperDiagnostics visible={devOpen} onDismiss={() => setDevOpen(false)} />
    </header>
  );
}

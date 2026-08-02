"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { LANDING_HEADER_BACKDROP } from "@/lib/landing-design-tokens";
import { LandingDeveloperDiagnostics } from "@/components/LandingDeveloperDiagnostics";
import { SiteLogoMark } from "./SiteLogoMark";

const BRAND_UNLOCK_TAPS = 5;
const BRAND_TAP_WINDOW_MS = 2000;
const BRAND_NAV_DELAY_MS = 220;

export function HeaderClient() {
  const t = useTranslations("Common");
  const ta = useTranslations("Auth");
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

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

  const signInWithGoogle = () => {
    const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/api/auth/google?next=${encodeURIComponent(nextPath)}`;
  };

  return (
    <header className={`sticky top-0 z-40 ${LANDING_HEADER_BACKDROP}`}>
      <div className="relative flex h-14 items-center justify-center px-4 lg:justify-between lg:px-5">
        <Link
          href="/"
          onClick={onBrandNavClick}
          title={t("siteBrand")}
          className="-mx-2 flex min-h-11 items-center gap-2 rounded-xl px-2 py-1 text-lg font-bold tracking-tight text-zinc-50 transition hover:bg-zinc-900/55 lg:flex-shrink-0 select-none"
        >
          <SiteLogoMark size={28} className="h-7 w-7 rounded-lg" />
          <span>{t("siteBrand")}</span>
        </Link>
        <button
          type="button"
          disabled={authLoading}
          onClick={user ? () => void signOut() : signInWithGoogle}
          className="absolute right-3 top-1/2 inline-flex min-h-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950/60 px-3 text-xs font-semibold text-zinc-100 shadow-sm shadow-black/20 transition hover:border-white/15 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 lg:right-5"
        >
          {user ? t("signOut") : ta("signInShort")}
        </button>
      </div>
      <LandingDeveloperDiagnostics visible={devOpen} onDismiss={() => setDevOpen(false)} />
    </header>
  );
}

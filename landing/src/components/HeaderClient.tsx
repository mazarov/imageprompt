"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { SiteLogoMark } from "./SiteLogoMark";
import { useAuth } from "@/context/AuthContext";
import { LocaleSwitcher } from "./LocaleSwitcher";

function UserMenu() {
  const t = useTranslations("Common");
  const { user, loading, openAuthModal, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />;
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={openAuthModal}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500"
      >
        {t("signIn")}
      </button>
    );
  }

  const avatarUrl = user.user_metadata?.avatar_url;
  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-800/80"
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={28} height={28} className="rounded-full" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/25 text-xs font-bold text-indigo-300">
            {displayName[0]?.toUpperCase()}
          </div>
        )}
        <span className="hidden text-[13px] font-medium text-zinc-300 sm:block">{displayName}</span>
      </button>
      {open && (
        <>
          <div className="absolute left-0 right-0 top-full z-40 h-2" />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-zinc-900/95 p-2 shadow-xl shadow-black/40 backdrop-blur-xl">
            <Link
              href="/favorites"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              {t("favorites")}
            </Link>
            <Link
              href="/generations"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
            >
              <span aria-hidden>🚀</span>
              {t("myGenerations")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t("signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function HeaderClient() {
  const t = useTranslations("Common");

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090b]/90 backdrop-blur-md">
      <div className="relative flex h-14 items-center justify-end gap-2 px-4 lg:hidden">
        <Link
          href="/"
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-lg font-bold tracking-tight text-zinc-50"
        >
          <SiteLogoMark size={28} className="h-7 w-7 rounded-lg" />
          <span>{t("brandWordmark")}</span>
        </Link>
        <LocaleSwitcher />
        <UserMenu />
      </div>

      <div className="hidden h-14 items-center justify-between gap-4 px-5 lg:flex">
        <Link href="/" className="flex flex-shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-zinc-50">
          <SiteLogoMark size={28} className="h-7 w-7 rounded-lg" />
          <span>{t("brandWordmark")}</span>
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2">
          <LocaleSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

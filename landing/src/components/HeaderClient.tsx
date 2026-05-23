"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LANDING_HEADER_BACKDROP } from "@/lib/landing-design-tokens";
import { SiteLogoMark } from "./SiteLogoMark";

export function HeaderClient() {
  const t = useTranslations("Common");

  return (
    <header className={`sticky top-0 z-40 ${LANDING_HEADER_BACKDROP}`}>
      <div className="relative flex h-14 items-center justify-center px-4 lg:justify-between lg:px-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-50 lg:flex-shrink-0"
        >
          <SiteLogoMark size={28} className="h-7 w-7 rounded-lg" />
          <span>{t("brandWordmark")}</span>
        </Link>
      </div>
    </header>
  );
}

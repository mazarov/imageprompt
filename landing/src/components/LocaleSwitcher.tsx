"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-zinc-950/60 p-0.5 text-[11px] font-semibold">
      <Link
        href={pathname}
        locale="en"
        className={`rounded-md px-2 py-1 transition-colors ${
          locale === "en" ? "bg-indigo-500/25 text-indigo-200" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        EN
      </Link>
      <Link
        href={pathname}
        locale="ru"
        className={`rounded-md px-2 py-1 transition-colors ${
          locale === "ru" ? "bg-indigo-500/25 text-indigo-200" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        RU
      </Link>
    </div>
  );
}

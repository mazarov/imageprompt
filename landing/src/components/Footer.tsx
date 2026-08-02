"use client";

import { useRef, useCallback, Component, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CONTACT_EMAIL } from "@/content/extension-privacy-policy";
import { LANDING_SURFACE_FOOTER } from "@/lib/landing-design-tokens";
import { FooterProductLinks } from "./FooterProductLinks";
import { SiteLogoMark } from "./SiteLogoMark";
import { useDebug } from "./DebugFAB";
import { LocaleSwitcher } from "./LocaleSwitcher";

// Lightweight boundary so a crash inside the language switcher (rare hydration edge case)
// cannot take down the entire footer or break client navigation on the page.
class SafeLanguageRow extends Component<{ children: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      // Graceful fallback: hide the language control instead of breaking the shell.
      return null;
    }
    return this.props.children;
  }
}

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
    <footer className={`mt-auto ${LANDING_SURFACE_FOOTER}`}>
      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex min-h-11 items-center gap-2 text-base font-bold tracking-tight text-zinc-50 select-none"
            >
              <SiteLogoMark
                size={24}
                className={`h-6 w-6 rounded-md ${debug?.debugOpen ? "ring-2 ring-amber-400/70" : ""}`}
              />
              {tc("siteBrand")}
            </button>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">{t("tagline")}</p>
          </div>
          <nav className="flex gap-12">
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{t("productsTitle")}</div>
              <ul className="space-y-2">
                <FooterProductLinks />
              </ul>
            </div>
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{t("companyTitle")}</div>
              <ul className="space-y-2">
                <li>
                  <Link href="/" className="inline-flex min-h-11 min-w-11 items-center text-sm text-zinc-400 transition-colors hover:text-zinc-100">
                    {tc("home")}
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="inline-flex min-h-11 items-center text-sm text-zinc-400 transition-colors hover:text-zinc-100">
                    {t("privacyLink")}
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="inline-flex min-h-11 items-center text-sm text-zinc-400 transition-colors hover:text-zinc-100"
                    aria-label={`Contact ImagePrompt at ${CONTACT_EMAIL}`}
                  >
                    {CONTACT_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} {tc("siteBrand")}. {t("copyright")}
          </p>

          <SafeLanguageRow>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              {t("language")}
              <LocaleSwitcher />
            </div>
          </SafeLanguageRow>
        </div>
      </div>
    </footer>
  );
}

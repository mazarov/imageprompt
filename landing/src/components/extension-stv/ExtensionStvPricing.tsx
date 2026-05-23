import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  LANDING_BORDER_CARD,
  LANDING_BORDER_INPUT,
  LANDING_SECTION_Y,
  LANDING_SURFACE_CARD,
  LANDING_SURFACE_CARD_EMPHASIS,
  LANDING_TEXT_SECTION_META,
} from "@/lib/landing-design-tokens";
import { STV_CHROME_STORE_URL, STV_FOCUS_RING } from "./stv-marketing-shared";

function CheckIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function ExtensionStvPricing() {
  const t = await getTranslations("Marketing.pricing");
  const strong = (chunks: ReactNode) => <strong className="font-medium text-zinc-300">{chunks}</strong>;

  return (
    <section className={LANDING_SECTION_Y} aria-labelledby="extension-stv-pricing-heading">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2
          id="extension-stv-pricing-heading"
          className="text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl"
        >
          {t("title")}
        </h2>
        <p className={`mx-auto mt-3 max-w-xl ${LANDING_TEXT_SECTION_META}`}>{t("subtitle")}</p>

        <div className="mt-8 grid gap-5 md:grid-cols-2 md:items-stretch md:gap-6">
          <article className={`flex flex-col rounded-2xl ${LANDING_BORDER_CARD} ${LANDING_SURFACE_CARD} p-5 sm:p-6`}>
            <h3 className="text-lg font-semibold text-zinc-100">{t("freeTitle")}</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-zinc-50">$0</span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{t("freeSub")}</p>

            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm leading-relaxed text-zinc-400">
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t.rich("freeLi1", { strong })}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t.rich("freeLi2", { strong })}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t.rich("freeLi3", { strong })}</span>
              </li>
            </ul>

            <a
              href={STV_CHROME_STORE_URL}
              className={`mt-6 inline-flex w-full items-center justify-center rounded-full bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.1] ${LANDING_BORDER_INPUT} ${STV_FOCUS_RING}`}
            >
              {t("freeCta")}
            </a>
          </article>

          <article className={`relative flex flex-col rounded-2xl border border-indigo-500/35 ${LANDING_SURFACE_CARD_EMPHASIS} p-5 shadow-[0_0_40px_-12px_rgba(99,102,241,0.35)] ring-1 ring-inset ring-indigo-500/15 sm:p-6`}>
            <h3 className="text-lg font-semibold text-zinc-100">{t("stdTitle")}</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-zinc-50">$14.99</span>
              <span className="text-base font-medium text-zinc-500">{t("stdPrice")}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{t("stdSub")}</p>

            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm leading-relaxed text-zinc-400">
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t.rich("stdLi1", { strong })}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t.rich("stdLi2", { strong })}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t("stdLi3")}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t("stdLi4")}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t.rich("stdLi5", { strong })}</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>{t("stdLi6")}</span>
              </li>
            </ul>

            <Link
              href="/"
              className={`mt-6 inline-flex w-full items-center justify-center rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-600 ${STV_FOCUS_RING}`}
            >
              {t("stdCta")}
            </Link>
          </article>
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-zinc-600">{t("footnote")}</p>
      </div>
    </section>
  );
}

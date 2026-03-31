import { getTranslations } from "next-intl/server";
import { ExtensionStvAccuracySection } from "./ExtensionStvAccuracySection";
import { ExtensionStvChromeBadge } from "./ExtensionStvChromeBadge";
import { ExtensionStvFaq } from "./ExtensionStvFaq";
import { ExtensionStvHowItWorks } from "./ExtensionStvHowItWorks";
import { ExtensionStvPricing } from "./ExtensionStvPricing";
import { ExtensionStvTestimonials } from "./ExtensionStvTestimonials";
import { PainReferenceVsDraftMock } from "./PainReferenceVsDraftMock";

const ANCHOR_SCROLL = "scroll-mt-[5.5rem]";

export type ExtensionStvMarketingHeroVariant = "home" | "extension";

type MarketingSectionsProps = {
  /** Главная: кластер A H1. Extension-лендинг: отдельный H1 без каннибализации title. */
  heroVariant?: ExtensionStvMarketingHeroVariant;
};

/**
 * Маркетинговые секции главной / extension-stv с `id` для якорей; копирайт из сообщений (en / ru).
 */
export async function ExtensionStvMarketingSections({
  heroVariant = "home",
}: MarketingSectionsProps) {
  const t = await getTranslations("Marketing");
  const heroTitle = heroVariant === "extension" ? t("heroExtension.title") : t("hero.title");
  const heroSubtitle = heroVariant === "extension" ? t("heroExtension.subtitle") : t("hero.subtitle");

  return (
    <>
      <div id="stv-hero" className={ANCHOR_SCROLL}>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-25%,rgba(99,102,241,0.18),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(139,92,246,0.1),transparent_50%)]" />
          <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-8 text-center sm:px-6 sm:pb-10 sm:pt-10">
            <h1 className="mx-auto max-w-3xl text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
              {heroTitle}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-base text-zinc-400 sm:text-lg">{heroSubtitle}</p>
            <ExtensionStvChromeBadge className="mx-auto mt-4 justify-center" />
          </div>
        </section>
      </div>

      <div id="stv-problem" className={ANCHOR_SCROLL}>
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-8 sm:gap-10 lg:gap-12">
            <PainReferenceVsDraftMock />
            <div className="max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">{t("problem.title")}</h2>
              <ul className="mt-5 space-y-3 text-zinc-400">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/80" />
                  <span>
                    {t.rich("problem.b1", {
                      strong: (chunks) => <strong className="text-zinc-100">{chunks}</strong>,
                    })}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/80" />
                  <span>
                    {t.rich("problem.b2", {
                      strong: (chunks) => <strong className="text-zinc-100">{chunks}</strong>,
                    })}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/80" />
                  <span>
                    {t.rich("problem.b3", {
                      strong: (chunks) => <strong className="text-zinc-100">{chunks}</strong>,
                    })}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div id="stv-accuracy" className={ANCHOR_SCROLL}>
        <ExtensionStvAccuracySection />
      </div>

      <div id="stv-reviews" className={ANCHOR_SCROLL}>
        <ExtensionStvTestimonials />
      </div>

      <div id="stv-how" className={ANCHOR_SCROLL}>
        <ExtensionStvHowItWorks />
      </div>

      <div id="stv-pricing" className={ANCHOR_SCROLL}>
        <ExtensionStvPricing />
      </div>

      <div id="stv-faq" className={ANCHOR_SCROLL}>
        <ExtensionStvFaq />
      </div>
    </>
  );
}

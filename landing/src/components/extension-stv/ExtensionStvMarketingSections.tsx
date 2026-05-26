import { getTranslations } from "next-intl/server";
import { ExtensionStvFaq } from "./ExtensionStvFaq";
import { ExtensionStvHowItWorks } from "./ExtensionStvHowItWorks";
// import { ExtensionStvPricing } from "./ExtensionStvPricing";
import { PromptSceneLiteWidgetGate } from "./PromptSceneLiteWidgetGate";
import { STV_SECTION_CONTAINER, STV_SECTION_PY } from "./stv-marketing-shared";

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
  const heroSubtitle = heroVariant === "home" ? t("hero.subtitle") : null;

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
            {heroSubtitle ? (
              <p className="mx-auto mt-3 max-w-2xl text-pretty text-base text-zinc-400 sm:text-lg">{heroSubtitle}</p>
            ) : null}
          </div>
        </section>
      </div>

      <div id="stv-problem" className={ANCHOR_SCROLL}>
        <section className={`${STV_SECTION_CONTAINER} ${STV_SECTION_PY}`}>
          <div className="flex flex-col gap-8 sm:gap-10 lg:gap-12">
            <PromptSceneLiteWidgetGate />
            <div className="mx-auto w-full max-w-3xl space-y-6 text-zinc-400">
              <p className="text-pretty leading-relaxed">
                <span aria-hidden className="mr-1 select-none">
                  ✨{" "}
                </span>
                {t("problem.intro")}
              </p>
              <div>
                <h3 className="text-base font-semibold text-zinc-100 sm:text-lg">{t("problem.featuresTitle")}</h3>
                <ul className="mt-3 space-y-3">
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/80" aria-hidden />
                    <span>{t("problem.f1")}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/80" aria-hidden />
                    <span>{t("problem.f2")}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/80" aria-hidden />
                    <span>{t("problem.f3")}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div id="stv-how" className={ANCHOR_SCROLL}>
        <ExtensionStvHowItWorks />
      </div>

      {/* Pricing — раскомментировать для показа
      <div id="stv-pricing" className={ANCHOR_SCROLL}>
        <ExtensionStvPricing />
      </div>
      */}

      <div id="stv-faq" className={ANCHOR_SCROLL}>
        <ExtensionStvFaq />
      </div>
    </>
  );
}

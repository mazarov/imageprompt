import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { absoluteUrl } from "@/lib/locale-path";
import { WelcomeReveal } from "./welcome-reveal";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const canonical = absoluteUrl(SITE_URL, "/welcome", locale);
  const enUrl = absoluteUrl(SITE_URL, "/welcome", "en");

  return {
    title: t("welcomePageTitle"),
    description: t("welcomePageDescription"),
    robots: "noindex, nofollow",
    alternates: {
      canonical,
      languages: { en: enUrl },
    },
  };
}

export default async function WelcomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Welcome" });

  const imgBase = `/welcome`;

  return (
    <PageLayout>
      <article className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <WelcomeReveal delayMs={0}>
          <header className="text-center sm:text-left">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">{t("heroTitle")}</h1>
          </header>
        </WelcomeReveal>

        <section className="mt-14 space-y-4">
          <WelcomeReveal delayMs={110}>
            <div className="flex flex-nowrap items-baseline gap-x-3 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <p className="shrink-0 text-xs font-semibold uppercase tracking-widest text-violet-400/95">{t("step1Eyebrow")}</p>
              <h2 className="min-w-0 shrink text-xl font-semibold text-zinc-50 sm:text-2xl">{t("step1Title")}</h2>
            </div>
            <figure className="mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40 shadow-xl shadow-black/30 ring-1 ring-white/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element -- static images in /public */}
              <img src={`${imgBase}/w1.webp`} alt={t("imgPinAlt")} width={880} height={520} className="h-auto w-full" />
              <figcaption className="sr-only">{t("imgPinPlaceholder")}</figcaption>
            </figure>
          </WelcomeReveal>
        </section>

        <section className="mt-16 space-y-4">
          <WelcomeReveal delayMs={220}>
            <div className="flex flex-nowrap items-baseline gap-x-3 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <p className="shrink-0 text-xs font-semibold uppercase tracking-widest text-violet-400/95">{t("step2Eyebrow")}</p>
              <h2 className="min-w-0 shrink text-xl font-semibold text-zinc-50 sm:text-2xl">{t("step2Title")}</h2>
            </div>
            <figure className="mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40 shadow-xl shadow-black/30 ring-1 ring-white/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${imgBase}/w2.webp`}
                alt={t("imgToolbarAlt")}
                width={880}
                height={520}
                className="h-auto w-full"
              />
              <figcaption className="sr-only">{t("imgToolbarPlaceholder")}</figcaption>
            </figure>
          </WelcomeReveal>
        </section>
      </article>
    </PageLayout>
  );
}

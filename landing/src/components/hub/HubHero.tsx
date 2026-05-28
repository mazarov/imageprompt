import { getTranslations } from "next-intl/server";

export async function HubHero() {
  const t = await getTranslations("Hub");

  return (
    <section className="relative overflow-hidden px-5 pb-12 pt-16 text-center sm:px-6 sm:pt-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-25%,rgba(99,102,241,0.2),transparent_55%)]" />
      <div className="relative mx-auto max-w-3xl">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl lg:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-zinc-400 sm:text-lg">{t("heroSubtitle")}</p>
      </div>
    </section>
  );
}

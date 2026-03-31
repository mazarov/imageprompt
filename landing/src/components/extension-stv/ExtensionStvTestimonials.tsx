import { getTranslations } from "next-intl/server";

export async function ExtensionStvTestimonials() {
  const t = await getTranslations("Marketing.testimonials");
  const items = [
    { name: t("mayaName"), role: t("mayaRole"), quote: t("mayaQuote") },
    { name: t("jonasName"), role: t("jonasRole"), quote: t("jonasQuote") },
    { name: t("elenaName"), role: t("elenaRole"), quote: t("elenaQuote") },
    { name: t("chrisName"), role: t("chrisRole"), quote: t("chrisQuote") },
    { name: t("amiraName"), role: t("amiraRole"), quote: t("amiraQuote") },
    { name: t("tomName"), role: t("tomRole"), quote: t("tomQuote") },
  ];

  return (
    <section className="border-t border-white/[0.06] py-12 sm:py-14" aria-labelledby="extension-stv-testimonials-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="extension-stv-testimonials-heading"
          className="text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl"
        >
          {t("title")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-500">{t("subtitle")}</p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:mt-12">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex flex-col rounded-xl border border-white/[0.08] bg-[rgb(24_24_27/0.4)] p-5 text-left"
            >
              <p className="text-sm leading-relaxed text-zinc-300">&ldquo;{item.quote}&rdquo;</p>
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <p className="text-sm font-semibold text-zinc-100">{item.name}</p>
                <p className="text-xs text-zinc-500">{item.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

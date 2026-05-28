import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PRODUCTS, type ProductSlug } from "@/lib/products/registry";

export async function HubProductGrid() {
  const t = await getTranslations("Hub");
  const tc = await getTranslations("Common");

  const cards = await Promise.all(
    PRODUCTS.map(async (product) => {
      const pt = await getTranslations(product.messageNamespace);
      return { product, pt };
    }),
  );

  return (
    <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
      <div className="grid gap-6 sm:grid-cols-2">
        {cards.map(({ product, pt }) => {
          const isLive = product.status === "live";
          const ctaLabel = isLive ? tc("tryIt") : t("learnMore");

          return (
            <Link
              key={product.slug}
              href={`/${product.slug as ProductSlug}`}
              aria-label={`${pt("title")} — ${ctaLabel}`}
              className="group flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 shadow-lg shadow-black/20 transition hover:border-white/[0.14] hover:bg-zinc-900/60"
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    isLive
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {isLive ? t("statusLive") : t("statusComingSoon")}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-50">{pt("title")}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{pt("cardDescription")}</p>
              <span className="mt-6 inline-flex w-fit items-center text-sm font-semibold text-indigo-300 transition group-hover:text-indigo-200">
                {ctaLabel}
                <span aria-hidden className="ml-1 transition group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { JsonLd } from "@/components/JsonLd";
import { Link } from "@/i18n/navigation";
import { absoluteUrl } from "@/lib/locale-path";
import { buildWebPageGraph, SITE_URL } from "@/lib/structured-data";
import type { ProductDefinition } from "@/lib/products/registry";

type Props = {
  product: ProductDefinition;
  locale: string;
};

export async function ComingSoonProductPage({ product, locale }: Props) {
  const t = await getTranslations({ locale, namespace: product.messageNamespace });
  const tc = await getTranslations({ locale, namespace: "Common" });

  const pageUrl = absoluteUrl(SITE_URL, `/${product.slug}`, locale);
  const homeUrl = absoluteUrl(SITE_URL, "/", locale);
  const jsonLd = buildWebPageGraph(t("title"), t("description"), pageUrl, [
    { name: tc("home"), url: homeUrl },
    { name: t("title"), url: pageUrl },
  ]);

  return (
    <PageLayout>
      <JsonLd id={`${product.slug}-json-ld`} data={jsonLd} />
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
        <span className="mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
          {t("comingSoonBadge")}
        </span>
        <h1 className="text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">{t("title")}</h1>
        <p className="mt-4 max-w-lg text-pretty text-base text-zinc-400 sm:text-lg">{t("description")}</p>
        <Link
          href="/"
          className="mt-10 inline-flex items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 px-6 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-zinc-800"
        >
          {tc("backToHub")}
        </Link>
      </div>
    </PageLayout>
  );
}

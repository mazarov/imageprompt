import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { JsonLd } from "@/components/JsonLd";
import { HomeAnchorSidebar } from "@/components/HomeAnchorSidebar";
import { ExtensionStvFloatingCta } from "@/components/extension-stv/ExtensionStvFloatingCta";
import { ExtensionStvMarketingSections } from "@/components/extension-stv/ExtensionStvMarketingSections";
import { Link } from "@/i18n/navigation";
import { absoluteUrl } from "@/lib/locale-path";
import { buildWebApplicationGraph, SITE_URL } from "@/lib/structured-data";
import type { ProductDefinition } from "@/lib/products/registry";

type Props = {
  product: ProductDefinition;
  locale: string;
};

export async function ExtensionMarketingProductPage({ product, locale }: Props) {
  const t = await getTranslations({ locale, namespace: "Meta" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });
  const tProduct = await getTranslations({ locale, namespace: product.messageNamespace });
  const description = t(product.metaDescriptionKey);
  const pageUrl = absoluteUrl(SITE_URL, `/${product.slug}`, locale);
  const homeUrl = absoluteUrl(SITE_URL, "/", locale);

  const jsonLd = buildWebApplicationGraph({
    name: tProduct("title"),
    description,
    url: pageUrl,
    breadcrumb: [
      { name: tCommon("home"), url: homeUrl },
      { name: tProduct("title"), url: pageUrl },
    ],
  });

  return (
    <PageLayout sidebar={<HomeAnchorSidebar />}>
      <nav
        aria-label="Breadcrumb"
        className="mx-auto w-full max-w-6xl px-4 pt-5 text-sm text-zinc-500 sm:px-6"
      >
        <ol className="flex min-h-11 items-center gap-2">
          <li>
            <Link
              href="/"
              className="inline-flex min-h-11 min-w-11 items-center rounded-md transition-colors hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {tCommon("home")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-zinc-300">
            {tProduct("title")}
          </li>
        </ol>
      </nav>
      <div className="pb-32">
        <ExtensionStvMarketingSections heroVariant="extension" />
        <ExtensionStvFloatingCta />
      </div>

      <JsonLd id={`${product.slug}-json-ld`} data={jsonLd} />
    </PageLayout>
  );
}

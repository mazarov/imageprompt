import Script from "next/script";
import { getTranslations } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { HomeAnchorSidebar } from "@/components/HomeAnchorSidebar";
import { ExtensionStvFloatingCta } from "@/components/extension-stv/ExtensionStvFloatingCta";
import { ExtensionStvMarketingSections } from "@/components/extension-stv/ExtensionStvMarketingSections";
import { absoluteUrl } from "@/lib/locale-path";
import type { ProductDefinition } from "@/lib/products/registry";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

type Props = {
  product: ProductDefinition;
  locale: string;
};

export async function ExtensionMarketingProductPage({ product, locale }: Props) {
  const t = await getTranslations({ locale, namespace: "Meta" });
  const title = t(product.metaTitleKey);
  const description = t(product.metaDescriptionKey);
  const pageUrl = absoluteUrl(SITE_URL, `/${product.slug}`, locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: title,
    description,
    url: pageUrl,
    applicationCategory: "BrowserApplication",
  };

  return (
    <PageLayout sidebar={<HomeAnchorSidebar />}>
      <div className="pb-32">
        <ExtensionStvMarketingSections heroVariant="extension" />
        <ExtensionStvFloatingCta />
      </div>

      <Script
        id={`${product.slug}-json-ld`}
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </PageLayout>
  );
}

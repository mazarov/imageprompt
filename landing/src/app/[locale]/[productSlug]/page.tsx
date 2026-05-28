import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ComingSoonProductPage } from "@/components/products/ComingSoonProductPage";
import { ExtensionMarketingProductPage } from "@/components/products/ExtensionMarketingProductPage";
import { buildProductMetadata } from "@/lib/products/metadata";
import {
  generateStaticProductParams,
  getProduct,
  isProductSlug,
} from "@/lib/products/registry";

export const revalidate = 3600;

type PageProps = { params: Promise<{ locale: string; productSlug: string }> };

export function generateStaticParams() {
  return generateStaticProductParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, productSlug } = await params;
  const product = getProduct(productSlug);
  if (!product) return {};
  return buildProductMetadata(product, locale);
}

export default async function ProductPage({ params }: PageProps) {
  const { locale, productSlug } = await params;
  if (!isProductSlug(productSlug)) notFound();

  const product = getProduct(productSlug);
  if (!product) notFound();

  setRequestLocale(locale);

  if (product.template === "extension-marketing") {
    return <ExtensionMarketingProductPage product={product} locale={locale} />;
  }

  if (product.template === "coming-soon") {
    return <ComingSoonProductPage product={product} locale={locale} />;
  }

  notFound();
}

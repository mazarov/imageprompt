"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PRODUCTS } from "@/lib/products/registry";

export function FooterProductLinks() {
  const tDescriber = useTranslations("Products.aiImageDescriber");
  const tGenerator = useTranslations("Products.aiPhotoGenerator");

  const labels: Record<string, string> = {
    "ai-image-describer": tDescriber("title"),
    "ai-photo-generator": tGenerator("title"),
  };

  return (
    <>
      {PRODUCTS.map((product) => (
        <li key={product.slug}>
          <Link href={`/${product.slug}`} className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
            {labels[product.slug]}
          </Link>
        </li>
      ))}
    </>
  );
}

export type ProductSlug = "ai-image-describer" | "ai-photo-generator";

export type ProductTemplate = "extension-marketing" | "coming-soon";

export type ProductSubRoute = "welcome";

export interface ProductDefinition {
  slug: ProductSlug;
  template: ProductTemplate;
  status: "live" | "coming_soon";
  icon: "describe" | "generate";
  messageNamespace: string;
  metaTitleKey: string;
  metaDescriptionKey: string;
  subRoutes?: ProductSubRoute[];
}

export const PRODUCTS: ProductDefinition[] = [
  {
    slug: "ai-image-describer",
    template: "extension-marketing",
    status: "live",
    icon: "describe",
    messageNamespace: "Products.aiImageDescriber",
    metaTitleKey: "aiImageDescriberTitleAbsolute",
    metaDescriptionKey: "aiImageDescriberDescription",
    subRoutes: ["welcome"],
  },
  {
    slug: "ai-photo-generator",
    template: "coming-soon",
    status: "coming_soon",
    icon: "generate",
    messageNamespace: "Products.aiPhotoGenerator",
    metaTitleKey: "aiPhotoGeneratorTitleAbsolute",
    metaDescriptionKey: "aiPhotoGeneratorDescription",
  },
];

const PRODUCT_BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));

export function getProduct(slug: string): ProductDefinition | undefined {
  return PRODUCT_BY_SLUG.get(slug as ProductSlug);
}

export function isProductSlug(slug: string): slug is ProductSlug {
  return PRODUCT_BY_SLUG.has(slug as ProductSlug);
}

export function productPath(slug: ProductSlug): string {
  return `/${slug}`;
}

export function productHasSubRoute(product: ProductDefinition, route: ProductSubRoute): boolean {
  return product.subRoutes?.includes(route) ?? false;
}

export function generateStaticProductParams(): { productSlug: ProductSlug }[] {
  return PRODUCTS.map((p) => ({ productSlug: p.slug }));
}

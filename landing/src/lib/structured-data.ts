/**
 * Centralized schema.org / JSON-LD builders.
 *
 * Rendered **server-side** as inline `<script type="application/ld+json">`
 * (see `JsonLd`), so the structured data is present in the initial HTML for
 * every crawler (Googlebot, Yandex, etc.), not injected client-side.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

const ORG_NAME = "ImagePrompt";
const LOGO_URL = `${SITE_URL}/favicon.png`;

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

type JsonLdNode = Record<string, unknown>;

/** Stable Organization node referenced by other schema via `@id`. */
export function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: ORG_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: LOGO_URL,
      width: 128,
      height: 128,
    },
  };
}

/** Stable WebSite node (publisher = Organization). */
export function webSiteNode(name: string, description: string): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name,
    description,
    publisher: { "@id": ORGANIZATION_ID },
    inLanguage: "en",
  };
}

/** Home page graph: Organization + WebSite. */
export function buildHomeGraph(name: string, description: string): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), webSiteNode(name, description)],
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbNode(items: BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface WebApplicationOptions {
  name: string;
  description: string;
  url: string;
  breadcrumb?: BreadcrumbItem[];
}

/**
 * Product (Chrome extension) graph: WebApplication with free `offers`,
 * `operatingSystem`, publisher reference and an optional BreadcrumbList.
 */
export function buildWebApplicationGraph({
  name,
  description,
  url,
  breadcrumb,
}: WebApplicationOptions): JsonLdNode {
  const application: JsonLdNode = {
    "@type": "WebApplication",
    name,
    description,
    url,
    applicationCategory: "BrowserApplication",
    operatingSystem: "Chrome",
    browserRequirements: "Requires a Chromium-based browser (Chrome, Edge).",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    publisher: { "@id": ORGANIZATION_ID },
  };

  const graph: JsonLdNode[] = [organizationNode(), application];
  if (breadcrumb && breadcrumb.length > 0) {
    graph.push(breadcrumbNode(breadcrumb));
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/** Generic WebPage + BreadcrumbList graph (e.g. coming-soon pages). */
export function buildWebPageGraph(
  name: string,
  description: string,
  url: string,
  breadcrumb?: BreadcrumbItem[],
): JsonLdNode {
  const graph: JsonLdNode[] = [
    organizationNode(),
    {
      "@type": "WebPage",
      name,
      description,
      url,
      isPartOf: { "@id": WEBSITE_ID },
    },
  ];
  if (breadcrumb && breadcrumb.length > 0) {
    graph.push(breadcrumbNode(breadcrumb));
  }
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

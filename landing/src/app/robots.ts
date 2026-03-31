import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imageprompt.tools");

function blockSearchIndexing(): boolean {
  const explicit = process.env.BLOCK_SEARCH_INDEXING?.toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "preview" || vercel === "development") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export default function robots(): MetadataRoute.Robots {
  if (blockSearchIndexing()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/embed/", "/welcome", "/ai-image-describer/welcome", "/*/ai-image-describer/welcome"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

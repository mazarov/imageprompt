import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      // `/privacy` and `/welcome` are deliberately crawlable so bots can read
      // their `noindex` meta tag; blocking them here would hide the directive.
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/embed/", "/admin/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

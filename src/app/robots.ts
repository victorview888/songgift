import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Let crawlers read the noindex directive on private UI routes, including admin.
    // Authentication and API authorization remain responsible for protecting data.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

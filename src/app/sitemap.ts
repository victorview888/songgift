import type { MetadataRoute } from "next";
import { occasionSlugs } from "@/lib/occasions";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/create", ...occasionSlugs.map((slug) => `/occasions/${slug}`)].map((path) => ({
    url: absoluteUrl(path),
  }));
}

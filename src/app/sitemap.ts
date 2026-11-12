import type { MetadataRoute } from "next";
import { occasionSlugs } from "@/lib/occasions";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // List only public, indexable pages. Do not generate dates without a real content change.
  return ["/", "/create", "/pricing", "/occasions", "/help", "/policies/content-standards", "/policies/terms", "/policies/privacy", "/policies/refunds", "/policies/audio-storage", ...occasionSlugs.map((slug) => `/occasions/${slug}`)].map((path) => ({
    url: absoluteUrl(path),
  }));
}

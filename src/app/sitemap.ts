import type { MetadataRoute } from "next";
import { guides } from "@/lib/guides";
import { occasionSlugs } from "@/lib/occasions";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // List only public, indexable pages. Do not generate dates without a real content change.
  return ["/", "/guides", ...guides.map(g => "/guides/" + g.slug), "/create", "/pricing", "/occasions", "/help", "/policies/content-standards", "/policies/terms", "/policies/privacy", "/policies/refunds", "/policies/audio-storage", ...occasionSlugs.map((slug) => `/occasions/${slug}`)].map((path) => ({
    url: absoluteUrl(path),
  }));
}

import type { Metadata } from "next";

export const siteUrl = "https://www.songforalways.com";
export const siteName = "SongGift";

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  const url = absoluteUrl(path);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName, locale: "en_US", url, title, description },
    twitter: { card: "summary", title, description },
  };
}

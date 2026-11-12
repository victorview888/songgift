import type { Metadata } from "next";

export const siteUrl = "https://www.songforalways.com";
export const siteName = "SongGift";
export const socialImagePath = "/brand/songgift-social.png";
export const socialImageAlt = "SongGift — personalized song gifts from your story";

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  const url = absoluteUrl(path);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website", siteName, locale: "en_US", url, title, description,
      images: [{ url: absoluteUrl(socialImagePath), width: 1200, height: 630, alt: socialImageAlt }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: absoluteUrl(socialImagePath), alt: socialImageAlt }] },
  };
}

// Public brand facts only. Customer stories and private order URLs never belong here.
export function websiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization", "@id": absoluteUrl("/#organization"), name: siteName,
        url: siteUrl, logo: absoluteUrl("/brand/songgift-icon.png"),
      },
      {
        "@type": "WebSite", "@id": absoluteUrl("/#website"), name: siteName,
        url: siteUrl, inLanguage: "en", publisher: { "@id": absoluteUrl("/#organization") },
      },
    ],
  };
}

export function songServiceStructuredData(publicPriceUsd: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": absoluteUrl("/pricing#song"),
    name: "Personalized AI song gift",
    serviceType: "Personalized song creation",
    description: "One AI-generated vocal song with free lyric preview and editing before music generation, account playback and audio download for personal listening and gifting.",
    url: absoluteUrl("/pricing"),
    image: absoluteUrl(socialImagePath),
    provider: { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: siteName, url: siteUrl },
    offers: {
      "@type": "Offer", url: absoluteUrl("/pricing"), price: publicPriceUsd, priceCurrency: "USD",
      description: "One standard song order. One-time payment; no subscription. Additional songs and remakes are not included.",
    },
  };
}

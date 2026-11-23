import type { Metadata } from "next";
import "./globals.css";
import "./account.css";
import "./legal.css";
import "./experience.css";
import "./gifting.css";
import "./faq.css";
import { AccountProvider } from "@/components/account-provider";
import { siteUrl } from "@/lib/seo";
import { UsageConsent } from "@/components/usage-consent";
import { campaignAllowlist } from "@/lib/growth/usage";
import { LegalFooter } from "@/components/legal-footer";
import { brandIcon, brandName } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${brandName} | Personalized Songs from Your Story`, template: `%s | ${brandName}` },
  description: "Turn your memories into a personalized song with lyrics you can review before the music is made.",
  applicationName: brandName,
  icons: {
    icon: [{ url: brandIcon, type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><AccountProvider>{children}</AccountProvider><LegalFooter /><UsageConsent campaigns={campaignAllowlist(process.env.SONGGIFT_ANALYTICS_CAMPAIGNS || "")} /></body>
    </html>
  );
}

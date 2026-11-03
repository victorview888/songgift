import type { Metadata } from "next";
import "./globals.css";
import "./account.css";
import { AccountProvider } from "@/components/account-provider";
import { siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "SongGift | Personalized Songs from Your Story", template: "%s | SongGift" },
  description: "Turn your memories into a personalized song with lyrics you can review before the music is made.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><AccountProvider>{children}</AccountProvider></body>
    </html>
  );
}

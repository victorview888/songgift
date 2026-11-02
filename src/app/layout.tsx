import type { Metadata } from "next";
import "./globals.css";
import "./account.css";
import { AccountProvider } from "@/components/account-provider";

export const metadata: Metadata = {
  title: "SongGift — Turn memories into music",
  description: "Create an original personalized song from a story worth remembering.",
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

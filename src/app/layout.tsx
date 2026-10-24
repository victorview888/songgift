import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SongGift — Turn memories into music",
  description: "Create an original personalized song from a story worth remembering.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

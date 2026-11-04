import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Lyrics",
  robots: { index: false, follow: false },
};

export default function LyricsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

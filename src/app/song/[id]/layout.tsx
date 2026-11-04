import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Song",
  robots: { index: false, follow: false },
};

export default function SongLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Songs",
  robots: { index: false, follow: false },
};

export default function MySongsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata(
  "Create a Personalized Song | SongGift",
  "Tell us about someone special, choose a mood, and review your personalized lyrics before you pay for the finished song.",
  "/create",
);

export default function CreateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

import type { Metadata } from "next";
import { AccountHeader } from "@/components/account-header";
import { AccountLinks } from "@/components/account-links";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <main className="form-page"><AccountHeader /><section className="customer-shell"><AccountLinks />{children}</section></main>;
}

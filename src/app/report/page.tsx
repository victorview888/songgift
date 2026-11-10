import Link from "next/link";
import { SupportShell } from "@/components/support-shell";
import { ContentReportForm } from "@/components/content-report-form";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = { ...publicPageMetadata("Report content | SongGift", "Report unsafe AI lyrics or music, impersonation and rights concerns to SongGift.", "/report"), robots: { index: false, follow: true }, referrer: "no-referrer" as const };
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const value = (await searchParams).reference;
  const reference = typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value) ? value : "";
  return <SupportShell><p className="section-kicker">Help keep SongGift safe</p><h1 className="customer-title">Report a content concern.</h1><p className="customer-intro">Report unsafe lyrics or audio, impersonation, copyright concerns, or ask us to reconsider a content decision. This form saves your report directly; it does not rely on opening your email app.</p><p><Link className="text-link" href="/policies/content-standards">Read our content standards and review process</Link></p><ContentReportForm initialReference={reference} /></SupportShell>;
}

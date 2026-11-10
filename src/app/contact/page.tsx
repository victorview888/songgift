import Link from "next/link";
import { SupportShell } from "@/components/support-shell";
import { ContactForm } from "@/components/contact-form";
import { getSupportEmail } from "@/lib/support";
import { isOrderId } from "@/lib/supabase/orders";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { ...publicPageMetadata("Contact SongGift", "Get help with your SongGift order, payment or account.", "/contact"), robots: { index: false, follow: true } };
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const query = await searchParams;
  const orderId = typeof query.orderId === "string" && isOrderId(query.orderId) ? query.orderId : "";
  return <SupportShell><p className="section-kicker">A little help</p><h1 className="customer-title">Contact SongGift</h1><p className="customer-intro">Tell us which order needs attention. Your payment record includes the full order reference.</p><p className="customer-intro">For unsafe lyrics or audio, impersonation, rights concerns or an appeal, <Link className="text-link" href="/report">submit a content report</Link>. The report form saves directly and provides a reference.</p><ContactForm email={getSupportEmail()} initialOrderId={orderId} /></SupportShell>;
}

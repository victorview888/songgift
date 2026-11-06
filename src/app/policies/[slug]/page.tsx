// Document layout adapted from ShrimpReel (MIT), e1447714d61eb67af653c931e917dce7b63012b0,
// src/components/LegalPage.tsx. SongGift content is independent. License: third-party/shrimpreel/LICENSE.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupportShell } from "@/components/support-shell";
import { publicPageMetadata } from "@/lib/seo";

const documents = {
  refunds: { title: "Payments & refund requests", description: "How to check a SongGift payment and ask for help with a refund.", sections: [
    ["Check the original payment", "SongGift uses PayPal for checkout. Your payment history shows recorded captures and refunds with their transaction references. A quote or a checkout return is not proof of a captured payment. Sandbox entries are tests."],
    ["Ask for a review", "For a duplicate charge, a song that has not been delivered, or a problem with the delivered song, contact support with your order reference and describe the issue. Keep your PayPal receipt so the payment can be checked. Do not send card details or sign-in codes."],
    ["Refund confirmation", "A request for review is not a confirmed refund. Check your PayPal Activity for the actual refund and its status. Payment and delivery issues need to be checked before a refund outcome can be confirmed."],
    ["Your rights", "This guidance does not limit any consumer rights that apply to your purchase."],
  ] },
  "audio-storage": { title: "Keeping your audio", description: "Access your private SongGift audio and keep a downloaded backup.", sections: [
    ["Download your finished song", "When your song is ready, open My Songs and download the audio. Keep a copy in a location you control and back it up, especially before the occasion you are planning."],
    ["Account access and playback links", "Your saved songs are private to your SongGift account. Playback and download links can expire. Reopen the song from My Songs to request a fresh link to the stored audio; an expired link alone does not mean the song has been deleted."],
    ["Browser drafts and saved orders", "An unfinished browser draft can be restored in the same tab for up to 24 hours. It is separate from an order saved to your account. Clearing a browser draft or logging out does not delete your saved songs."],
    ["If audio is unavailable", "If a fresh link does not play or download, contact support with the order reference. Keep your downloaded copy as your own backup rather than relying only on a hosted link."],
  ] },
} as const;
function document(slug: string) { return slug === "refunds" || slug === "audio-storage" ? documents[slug] : null; }
export function generateStaticParams() { return Object.keys(documents).map(slug => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, doc = document(slug);
  return doc ? publicPageMetadata(doc.title + " | SongGift", doc.description, "/policies/" + slug) : { title: "Page not found", robots: { index: false } };
}
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = document((await params).slug);
  if (!doc) notFound();
  return <SupportShell><article className="policy-document"><p className="section-kicker">SongGift guidance</p><h1 className="customer-title">{doc.title}</h1><p className="customer-intro">{doc.description}</p>{doc.sections.map(([title, body]) => <section className="customer-card" key={title}><h2>{title}</h2><p>{body}</p></section>)}<p><Link className="text-link" href="/contact">Contact support</Link> · <Link className="text-link" href="/help">Help centre</Link></p></article></SupportShell>;
}

// Document layout adapted from ShrimpReel (MIT), e1447714d61eb67af653c931e917dce7b63012b0,
// src/components/LegalPage.tsx. SongGift content is independent. License: third-party/shrimpreel/LICENSE.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupportShell } from "@/components/support-shell";
import { publicPageMetadata } from "@/lib/seo";
import { legalDetails, legalDocuments, type PolicyDocument } from "@/lib/legal/documents";

const documents = {
  refunds: { title: "Payments & refund requests", description: "How to check a SongGift payment and ask for help with a refund.", sections: [
    ["Check the original payment", "SongGift uses PayPal for checkout. Your payment history shows recorded captures and refunds with their transaction references. A quote or a checkout return is not proof of a captured payment. Sandbox entries are tests."],
    ["Ask for a review", "For a duplicate charge, a song that has not been delivered, or a problem with the delivered song, contact support with your order reference and describe the issue. Keep your PayPal receipt so the payment can be checked. Do not send card details or sign-in codes."],
    ["Refund confirmation", "A request for review is not a confirmed refund. Check your PayPal Activity for the actual refund and its status. Payment and delivery issues need to be checked before a refund outcome can be confirmed."],
    ["Your rights", "This guidance does not limit any consumer rights that apply to your purchase."],
  ] },
  "audio-storage": { title: "Keeping your audio", description: "Access your private SongGift audio and keep a downloaded backup.", sections: [
    ["Long-term storage", "We currently keep purchased songs in your account long term, without a scheduled expiry for the finished audio. We still recommend downloading your song and keeping your own backup."],
    ["Download your finished song", "When your song is ready, open My Songs and download the audio. Keep a copy in a location you control and back it up, especially before the occasion you are planning."],
    ["Account access and playback links", "Your saved songs are private to your SongGift account. Playback and download links can expire. Reopen the song from My Songs to request a fresh link to the stored audio; an expired link alone does not mean the song has been deleted."],
    ["Browser drafts and saved orders", "An unfinished browser draft can be restored in the same tab for up to 24 hours. It is separate from an order saved to your account. Clearing a browser draft or logging out does not delete your saved songs."],
    ["If audio is unavailable", "If a fresh link does not play or download, contact support with the order reference. Keep your downloaded copy as your own backup rather than relying only on a hosted link."],
  ] },
} as const;
function document(slug: string): PolicyDocument | null {
  if (slug === "terms" || slug === "privacy" || slug === "content-standards") return legalDocuments[slug];
  if (slug !== "refunds" && slug !== "audio-storage") return null;
  const existing = documents[slug];
  return { ...existing, sections: existing.sections.map(([title, body]) => ({ title, blocks: [{ kind: "paragraph", text: body }] })) };
}
export function generateStaticParams() { return [...Object.keys(documents), ...Object.keys(legalDocuments)].map(slug => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, doc = document(slug);
  return doc ? publicPageMetadata(doc.title + " | SongGift", doc.description, "/policies/" + slug) : { title: "Page not found", robots: { index: false } };
}
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = document((await params).slug);
  if (!doc) notFound();
  return <SupportShell><article className="policy-document">
    <p className="section-kicker">{doc.effectiveDate ? "SongGift policies" : "SongGift guidance"}</p>
    <h1 className="customer-title">{doc.title}</h1>
    <p className="customer-intro">{doc.description}</p>
    {doc.effectiveDate && <>
      <section className="customer-card policy-identity" aria-label="Policy details">
        <dl>
          <dt>Effective date</dt><dd><time dateTime={doc.effectiveDate}>10 November 2026</time></dd>
          <dt>Operator</dt><dd lang="zh-CN">{legalDetails.operator}</dd>
          <dt>Location</dt><dd>{legalDetails.location} <span lang="zh-CN">（中国上海）</span></dd>
          <dt>Contact</dt><dd><a className="text-link" href={"mailto:" + legalDetails.email}>{legalDetails.email}</a></dd>
        </dl>
      </section>
      <nav className="policy-toc" aria-label="On this page"><strong>On this page</strong>{doc.sections.map((section, i) => <a key={section.title} href={"#section-" + (i + 1)}>{section.title}</a>)}</nav>
    </>}
    {doc.sections.map((section, i) => <section className="customer-card" id={"section-" + (i + 1)} key={section.title}>
      <h2>{section.title}</h2>
      {section.blocks.map((block, j) => block.kind === "paragraph" ? <p key={j}>{block.text}</p> : block.kind === "list" ? <ul key={j}>{block.items.map(item => <li key={item}>{item}</li>)}</ul> : <div key={j} className="policy-provider-links">{block.links.map(link => <a className="text-link" key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>)}
    </section>)}
    <p><Link className="text-link" href="/contact">Contact support</Link> · <Link className="text-link" href="/help">Help centre</Link></p>
  </article></SupportShell>;
}

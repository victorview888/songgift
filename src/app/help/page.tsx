import Link from "next/link";
import { SupportShell } from "@/components/support-shell";
import { publicPageMetadata } from "@/lib/seo";
import { songFaqGroups, type SongFaq } from "@/lib/song-faqs";
import { SongFaqList } from "@/components/song-faq-list";
import { audioPreviewEnabled } from "@/lib/preview-policy";
import { publicSongPriceUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata("songforalways FAQ & Help: Creating, Paying & Gifting", "Answers about your song story, free lyric editing, available audio previews, one-time pricing, downloads, gift links and order support.", "/help");

export default function HelpPage() {
  const hasPreview = audioPreviewEnabled();
  const groups = songFaqGroups({ price: publicSongPriceUsd(), hasPreview });
  const all = new Map(groups.flatMap(group => group.items.map(item => [item.id, item] as const)));
  const entry = (id: string) => {
    const item = all.get(id);
    if (!item) throw new Error("Missing help answer: " + id);
    return item;
  };
  const sections: { id: string; title: string; items: SongFaq[] }[] = [
    { id: "getting-started", title: "Before you create", items: groups[0].items },
    { id: "audio-preview", title: hasPreview ? "Free audio preview" : "Free lyric draft", items: [entry("free-preview"), ...(hasPreview ? [
      { id: "same-recording", question: "Does payment make a different recording?", answer: "Buying a song you previewed unlocks that same full recording and its download. Starting a preview freezes its lyrics. Changing words or style needs a separate recording; free unlimited remakes are not included." },
      { id: "preview-failure", question: "What if the preview fails?", answer: "A confirmed technical generation failure restores the allowance. If a request's outcome is uncertain, we keep checking the original request while its allowance stays reserved. Check the saved order again or contact support rather than starting another order to fix it.", links: [{ label: "Contact support", href: "/contact" }] },
    ] : [])] },
    { id: "account", title: "Sign in and find your songs", items: [
      { id: "sign-in-email", question: "Which email should I use?", answer: "Use the email you used for your songforalways order. Enter the latest sign-in code from your inbox; check spam if it has not arrived. Never send your code to anyone.", links: [{ label: "Sign in", href: "/login" }] },
      { id: "saved-story", question: "Where is my unfinished story?", answer: "Return to Create in the same tab to restore a valid draft for up to 24 hours. After lyrics are saved, find the order in My Songs. Logging out clears the draft in this tab and keeps your saved orders.", links: [{ label: "Continue your story", href: "/create" }] },
    ] },
    { id: "payments", title: "Payments and order records", items: [
      entry("song-price"), entry("payment-methods"), entry("order-problems"),
      { id: "charged-not-paid", question: "PayPal charged me, but my song still shows unpaid.", answer: "Keep the receipt in your PayPal Activity and contact support with your full songforalways order reference. Do not pay for a second order to fix the first. A return from checkout alone does not confirm a captured payment.", links: [{ label: "Contact support", href: "/contact" }] },
      { id: "unverified-amount", question: "Why does a payment say amount unverified?", answer: "Some historical orders have a payment marker without a verified transaction amount. We show that uncertainty instead of using today's price. Your original PayPal receipt can help support check the payment." },
      { id: "sandbox-payment", question: "What is a Sandbox test?", answer: "Sandbox entries record test payments rather than real charges. They are clearly marked in your payment history." },
    ] },
    { id: "delivery", title: "Song delivery and lyric changes", items: [entry("delivery-time"), entry("lyric-edits")] },
    { id: "downloads", title: "Download and keep your song", items: [entry("audio-download")] },
    { id: "gift-links", title: "Private gift links", items: [
      entry("give-a-song"),
      { id: "replace-gift-link", question: "What happens if I replace or turn off the link?", answer: "Creating a new gift link replaces earlier links for this song. Turning off sharing stops future access through the link. Anyone who receives an active link may forward it, and audio already received or saved cannot be recalled." },
      { id: "event-playback", question: "Should I use a link at a wedding or event?", answer: "Test the whole recording and the playback setup in advance. Keep a downloaded copy on the device you will use so a lost connection does not interrupt the moment. Check any file or permission requirements with your venue.", links: [{ label: "Gift-sharing guide", href: "/guides/give-a-personal-song-gift" }] },
    ] },
    { id: "privacy-rights", title: "Privacy and song-use permissions", items: groups[3].items },
  ];

  return <SupportShell>
    <p className="section-kicker">Good to know</p><h1 className="customer-title">Here to help.</h1>
    <p className="customer-intro">Start with a story, understand your preview and payment, or find help with a finished song. Choose a topic below. For an existing order, keep its reference handy so we can check the right recording.</p>
    <div className="draft-actions"><Link className="text-link" href="/my-songs">My Songs</Link><Link className="text-link" href="/account/payments">Payment history</Link><Link className="text-link" href="/contact">Contact support</Link></div>
    <nav className="help-topics" aria-label="Help topics">{sections.map(section => <a className="text-link" key={section.id} href={"#" + section.id}>{section.title}</a>)}</nav>
    {sections.map(section => <section className="customer-card help-section" id={section.id} aria-labelledby={`help-heading-${section.id}`} key={section.id}><h2 id={`help-heading-${section.id}`}>{section.title}</h2><SongFaqList items={section.items} idPrefix="help-faq" /></section>)}
    <p className="customer-intro">Need a starting point for your song? Read a <Link className="text-link" href="/occasions/birthday">birthday story example</Link>, hear a <Link className="text-link" href="/occasions/christmas">Christmas song for a family tradition</Link>, or find <Link className="text-link" href="/occasions/memorial">words for a memorial song</Link>.</p>
    <p className="customer-intro">Step-by-step help: <Link className="text-link" href="/guides/review-lyrics-before-music">Review your lyrics</Link> · <Link className="text-link" href="/guides/give-a-personal-song-gift">Give a song privately</Link>. More details: <Link className="text-link" href="/policies/refunds">Payment & refund help</Link> · <Link className="text-link" href="/policies/audio-storage">Keeping your audio</Link>.</p>
  </SupportShell>;
}

import Link from "next/link";
import { SupportShell } from "@/components/support-shell";
import { SongPrice } from "@/components/song-price";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata("SongGift pricing", "See the price, USD currency, PayPal payment option and what a personalised AI song includes.", "/pricing");

export default function PricingPage() {
  return <SupportShell><p className="section-kicker">Clear from the start</p><h1 className="customer-title">A personal song, with a clear price.</h1><p className="customer-intro">Read and edit your AI-written lyrics first. Pay once when you are ready to create the music.</p>
    <SongPrice />
    <section className="customer-card"><h2>Currency and payment options</h2><p>SongGift prices and charges standard orders in US dollars (USD). The currently available payment method is PayPal. PayPal decides which accounts, cards and regions can use its checkout; availability is not guaranteed for every visitor.</p><p>The listed price is SongGift’s total charge for one standard song order. Your bank or payment provider may apply separate currency-conversion or payment fees. Review those before authorising payment. Waffo and local-currency checkout are not currently offered on this site.</p><p>If your order already has a saved quote or an account-specific offer, its confirmed checkout price applies. The original quote will be shown before payment; existing orders are not repriced from this page.</p></section>
    <section className="customer-card"><h2>Edits, remakes and delivery issues</h2><p>You can edit and save the lyric text before music generation. Changing lyrics after generation starts does not revise the recording already in progress. A new musical arrangement, an additional song or a remake requested for preference is not automatically included.</p><p>For an undelivered song, a duplicate payment or a technical audio problem, contact us with the order reference so we can check the original task and the appropriate remedy. Any optional additional service will be explained and priced before you decide; no automatic add-on charge is made.</p><p><Link className="text-link" href="/policies/refunds">Payment and refund information</Link> · <Link className="text-link" href="/contact">Contact support</Link></p></section>
    <section className="customer-card"><h2>Keep and give your song</h2><p>The price includes account access to the completed audio, personal listening, downloading and gifting to the recipient. We currently keep purchased audio long term with no scheduled expiry; download a backup. Commercial distribution or additional usage rights require checking before purchase.</p><p><Link className="text-link" href="/policies/terms">Terms of Service</Link> · <Link className="text-link" href="/policies/audio-storage">Keeping your audio</Link></p></section>
  </SupportShell>;
}

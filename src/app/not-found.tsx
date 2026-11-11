import Link from "next/link";
import { AccountHeader } from "@/components/account-header";

export default function NotFound() {
  return <main className="form-page"><AccountHeader /><section className="customer-shell">
    <p className="section-kicker">Page not found</p>
    <h1 className="customer-title">Let’s find your next song.</h1>
    <p className="customer-intro">This address does not lead to a page on SongGift. Explore song ideas, start a new story, or find a saved order in My Songs.</p>
    <div className="draft-actions"><Link className="primary-button" href="/">Back to home</Link><Link className="text-link" href="/occasions">Explore song occasions</Link><Link className="text-link" href="/my-songs">My Songs</Link></div>
  </section></main>;
}

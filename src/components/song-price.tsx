import { ArrowIcon } from "@/components/arrow-icon";
import Link from "next/link";
import { publicSongPriceUsd } from "@/lib/pricing";
import { audioPreviewEnabled } from "@/lib/preview-policy";

export function SongPrice({ compact = false }: { compact?: boolean }) {
  const price = publicSongPriceUsd();
  return <section className={compact ? "song-price song-price-compact" : "customer-card song-price"} aria-label="Song pricing">
    <div><p className="section-kicker">One song. One payment.</p><h2>US${price} <span>per personalised song</span></h2><p>Charged in USD · PayPal · No subscription</p></div>
    <div><ul><li>Free AI lyric preview and your own lyric edits before music generation.</li>{audioPreviewEnabled() && <li>One free audio creation per verified account, with up to 60 seconds to replay. Availability limits apply.</li>}<li>One complete AI-generated vocal song, playback and audio download. A preview purchase unlocks that same recording.</li><li>New arrangements, additional songs and optional remakes are not included. Any extra work needs a separate quote and your approval.</li></ul>
    {compact ? <Link className="text-link" href="/pricing">See full pricing and what is included →</Link> : <Link className="primary-button" href="/create">Start with free lyrics <ArrowIcon /></Link>}</div>
  </section>;
}

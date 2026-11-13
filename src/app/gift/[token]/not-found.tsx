import Link from "next/link";
export default function GiftUnavailable() {
  return (
    <main className="gift-shell">
      <p className="section-kicker">SongGift</p>
      <h1>This gift link is unavailable.</h1>
      <p>
        The sender may have replaced it or turned sharing off. Ask them for the
        current link.
      </p>
      <Link className="text-link" href="/">
        Visit SongGift →
      </Link>
    </main>
  );
}

import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { publicPageMetadata } from "@/lib/seo";
import { guides } from "@/lib/guides";
export const metadata = publicPageMetadata(
  "Personal Song Gift Guides | SongGift",
  "Practical guides to writing your story, reviewing lyrics and giving a personal song gift.",
  "/guides",
);
export default function Guides() {
  return (
    <main className="form-page">
      <AccountHeader />
      <section className="guide-hub">
        <p className="section-kicker">Small details, meaningful songs</p>
        <h1>Make your story sing.</h1>
        <p>Useful steps for the moments before and after your song is made.</p>
        <div className="guide-grid">
          {guides.map((g) => (
            <article key={g.slug}>
              <p className="section-kicker">
                {g.category} · {g.minutes} min read
              </p>
              <h2>
                <Link href={"/guides/" + g.slug}>{g.title}</Link>
              </h2>
              <p>{g.description}</p>
              <Link className="text-link" href={"/guides/" + g.slug}>
                Read the guide →
              </Link>
            </article>
          ))}
        </div>
        <Link className="primary-button" href="/create">
          Start with your story →
        </Link>
      </section>
    </main>
  );
}

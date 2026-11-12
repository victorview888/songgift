import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { ArrowIcon } from "@/components/arrow-icon";
import { JsonLd } from "@/components/json-ld";
import { occasionSlugs, occasions } from "@/lib/occasions";
import { absoluteUrl, publicPageMetadata } from "@/lib/seo";
import "./occasions.css";

export const metadata = publicPageMetadata(
  "Personalized Song Gifts for Every Occasion | SongGift",
  "Find a personal song gift for birthdays, weddings, anniversaries, family, pets or remembrance. Explore story ideas and review your lyrics before paying.",
  "/occasions",
);

const summaries: Record<string, string> = {
  birthday: "Celebrate their little quirks, a favorite adventure and everything you hope the next year brings.",
  wedding: "Bring together the first meeting, the everyday moments and the promises behind your love story.",
  anniversary: "Return to the places, changes and small traditions that have made a life together.",
  family: "Say thank you to a parent, child, grandparent or chosen family through a memory of their care.",
  pet: "Celebrate a companion's funny habits and shared adventures, or remember the time you had together.",
  memorial: "Keep a loved one's everyday kindness close with a gentle tribute, written at your own pace.",
};

export default function OccasionsPage() {
  return <main className="occasion-page">
    <JsonLd data={{
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Song occasions", item: absoluteUrl("/occasions") },
      ],
    }} />
    <AccountHeader />
    <div className="occasion-shell">
      <nav className="occasion-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Song occasions</span></nav>
      <section className="occasion-hub-heading">
        <p className="section-kicker">Start with someone special</p>
        <h1>Personalized song gifts for life’s meaningful moments.</h1>
        <p>A birthday surprise, a quiet thank-you or a memory you want to keep. Choose a guide for practical story ideas, then make the song your own with the details only you know.</p>
      </section>
      <section className="occasion-hub-grid" aria-label="Choose a song occasion">
        {occasionSlugs.map((slug, index) => <article className="occasion-hub-card" key={slug}>
          <span className="occasion-number" aria-hidden="true">0{index + 1}</span>
          <h2><Link href={`/occasions/${slug}`}>{occasions[slug].name} songs <ArrowIcon /></Link></h2>
          <p>{summaries[slug]}</p>
        </article>)}
      </section>
      <section className="occasion-gifting" aria-labelledby="occasion-start-heading">
        <p className="section-kicker">Your story, in your words</p>
        <h2 id="occasion-start-heading">One memory is a good place to begin.</h2>
        <p>Tell us who the song is for, describe a moment you remember, and say what you want them to hear. You do not need to write lyrics yourself. SongGift uses AI to create a draft you can read and edit for free before paying for the music.</p>
        <p>Choose a mood and music direction, check the names and details, then create the song when you are ready. The finished audio stays in your account for playback and download. Download a copy to give to your recipient; your account song page requires your own sign-in.</p>
        <div className="occasion-action-links"><Link href="/pricing">Pricing and what is included</Link><Link href="/help">Help with creating and keeping a song</Link></div>
        <Link className="primary-button" href="/create">Start with free lyrics <ArrowIcon /></Link>
      </section>
    </div>
  </main>;
}
